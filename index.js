import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";

//setting an express server
const app = express();
dotenv.config();

const port = 5000;

// Configure OAuth2 credentials
const credentials = {
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  redirect_uri: process.env.REDIRECT_URI,
};

// Configure an OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  credentials.client_id,
  credentials.client_secret,
  credentials.redirect_uri
);

// User scopes for accessing the GMAIL APIs
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
];

// ROute to Generate the authentication URL
app.get("/auth", async (req, res) => {
  try {
    const authUrl = await oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      response_type: "code",
    });
    // console.log(authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.log(error.message);
  }
});

// A Callback route after successful authentication
app.get("/auth/google", async (req, res) => {
  const authorizationCode = req.query.code;

  if (!authorizationCode) {
    res.status(400).send("Error: Authorization code is missing.");
    return;
  }

  try {
    // Exchange the authorization code for an access token
    const { tokens } = await oAuth2Client.getToken(authorizationCode);
    oAuth2Client.setCredentials(tokens);

    const minInterval = 45 * 1000; // 45 seconds
    const maxInterval = 120 * 1000; // 120 seconds
    const interval = Math.random() * (maxInterval - minInterval) + minInterval;

    console.log("Next iteration in", interval / 1000, "seconds");


    // Periodically check for new emails for every 45 to 120 seconds
    setInterval(async () => {
      try {
        const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

        // Get the list of unread messages
        const response = await gmail.users.messages.list({
          userId: "me",
          q: "is:unread",
        });

        const messages = response.data.messages || [];

        for (const message of messages) {
          const messageResponse = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
          });

          const thread = messageResponse.data.threadId;
          const replies = messageResponse.data.payload.headers.filter(
            (header) => header.name === "To"
          );

          // If there are no replies, send a reply and add a label
          if (replies.length === 0) {
            const replyMessage =
              "Hi, THanks for your mail. I am currently on vacation . and would not be able to give reply to this mail";

            await gmail.users.messages.send({
              userId: "me",
              requestBody: {
                threadId: thread,
                raw: Buffer.from(
                  `To: ${
                    message.payload.headers.find(
                      (header) => header.name === "From"
                    ).value || ""
                  }\r\n` +
                    `Subject: Re: ${
                      message.payload.headers.find(
                        (header) => header.name === "Subject"
                      )?.value || ""
                    }\r\n` +
                    `Content-Type: text/plain; charset="UTF-8"\r\n` +
                    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                    replyMessage
                ).toString("base64"),
              },
            });

            await gmail.users.threads.modify({
              userId: "me",
              id: thread,
              requestBody: {
                addLabelIds: ["Mail_Auto_Replied"],
              },
            });
          }
        }
      } catch (error) {
        console.error("Error occurred:", error);
      }
    }, interval); // Checks for a random interval between 45 to 120 seconds

    res.send("Authentication successful! You can close this window.");
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).send("Error: An unexpected error occurred.");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});