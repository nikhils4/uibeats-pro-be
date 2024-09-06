const Mailjet = require("node-mailjet");
const fs = require("fs");
const Handlebars = require("handlebars");

const mailjet = new Mailjet({
  apiKey: process.env.MJ_APIKEY_PUBLIC,
  apiSecret: process.env.MJ_APIKEY_PRIVATE,
});

module.exports.addEmailToMailJet = async (email) => {
  try {
    const request = mailjet.post("contact", { version: "v3" }).request({
      Email: email,
    });
    const response = await request;
    console.log(response);
    return !!response.body;
  } catch (error) {
    console.log("sendEmail", error);
    return false;
  }
};

module.exports.sendEmail = async (toEmail, subject, templateName, data) => {
  const { tempPassword = "444444" } = data || {};
  try {
    const source = fs.readFileSync(
      __dirname + `/../email-templates/${templateName}.html`,
      "utf-8"
    );
    const template = Handlebars.compile(source);
    const formattedTemplate = template(data);
    const request = mailjet.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: "hello@nikhils.ca",
            Name: "Nikhil @ ui/beats",
          },
          To: [
            {
              Email: toEmail,
            },
          ],
          Subject: subject,
          HTMLPart: formattedTemplate,
        },
      ],
    });
    const response = await request;
    console.log(response);
    return !!response.body;
  } catch (error) {
    console.log("sendEmail", error);
    return false;
  }
};
