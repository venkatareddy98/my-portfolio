const result = require("dotenv").config({ path: require("path").join(__dirname, ".env") });
console.log("dotenv:", result.error ? "FAILED - " + result.error.message : "loaded " + Object.keys(result.parsed).join(", "));
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1); // needed behind Render/Railway proxies for correct client IPs
app.use(helmet({ contentSecurityPolicy: false })); // pages use inline <style>/<script>
app.use(express.json({ limit: "10kb" }));

// CORS: only needed if the frontend is hosted on a different origin (e.g. GitHub Pages)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((o) => o.trim()).filter(Boolean);
app.use("/api", cors({ origin: allowedOrigins.length ? allowedOrigins : false }));

// Serve the portfolio pages
app.use(express.static(path.join(__dirname, "public")));

// Email transport
const mailer = process.env.EMAIL_USER && process.env.EMAIL_PASS
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please try again in a few minutes." },
});

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/contact", contactLimiter, async (req, res) => {
  const { name = "", email = "", message = "", website = "" } = req.body || {};

  // Honeypot: bots fill this hidden field. Pretend success.
  if (website) return res.json({ message: "Thanks! Your message has been sent." });

  const n = String(name).trim();
  const e = String(email).trim();
  const m = String(message).trim();

  if (!n || !e || !m) return res.status(400).json({ error: "All fields are required." });
  if (n.length > 100) return res.status(400).json({ error: "Name is too long." });
  if (e.length > 254 || !emailRegex.test(e)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (m.length > 5000) return res.status(400).json({ error: "Message is too long (max 5000 characters)." });

  if (!mailer) {
    console.warn("EMAIL_USER / EMAIL_PASS not set. Logging message instead:", { n, e, m });
    return res.json({ message: "Thanks! Your message has been received." });
  }

  try {
    await mailer.sendMail({
      from: `"Portfolio Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.CONTACT_TO || process.env.EMAIL_USER,
      replyTo: `"${n.replace(/"/g, "")}" <${e}>`,
      subject: `New portfolio message from ${n}`,
      text: `Name: ${n}\nEmail: ${e}\n\n${m}`,
      html: `<h3>New portfolio message</h3>
             <p><strong>Name:</strong> ${escapeHtml(n)}</p>
             <p><strong>Email:</strong> ${escapeHtml(e)}</p>
             <p><strong>Message:</strong></p>
             <p>${escapeHtml(m).replace(/\n/g, "<br>")}</p>`,
    });
    res.json({ message: "Thanks! Your message has been sent." });
  } catch (err) {
    console.error("Mail error:", err.message);
    res.status(500).json({ error: "Could not send your message right now. Please try again later." });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
