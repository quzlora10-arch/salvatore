# SALVATORE

Salvatore is a YouTube-style video platform starter project with:

- Account registration
- E-mail verification code (OTP)
- Nickname and password
- Login
- Personal channels
- Video upload
- Search
- Views
- Likes
- Comments
- Subscriptions
- Admin panel
- Admin user disable/delete
- Admin password reset
- JSON data storage (no better-sqlite3)

## Important architecture

GitHub Pages can host the frontend, but it cannot run the Node.js backend or send e-mail itself.

Recommended setup:

1. Put this repository on GitHub.
2. Deploy the `backend` Node.js application to a Node-capable hosting service.
3. Put the frontend on GitHub Pages, or let the Express server serve it.
4. Set the frontend API URL in `frontend/js/config.js`.
5. Configure SMTP values in the backend `.env`.

## Local Windows setup

Install Node.js first.

Then in the project folder:

```bat
npm install
copy .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

## First admin

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.
The admin account is created automatically on server start.

## E-mail verification

The server generates a 6-digit code and sends it through SMTP.
Codes expire after 10 minutes and are rate-limited.

## Security notes

- Passwords are hashed with bcryptjs.
- JWT is used for sessions.
- Verification codes are never stored in plain text.
- Do not commit `.env`.
- Use HTTPS in production.
- Use a real persistent database/object storage before large-scale public use.
- The JSON store is intentionally simple and suitable for a starter/demo deployment, not a high-scale production service.

## Google visibility

No service can guarantee position #1 on Google. The project includes basic SEO, canonical URLs, robots.txt, sitemap.xml, Open Graph metadata and crawlable pages. Submit the final public site to Google Search Console.
