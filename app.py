
import os
import smtplib
import sqlite3
import resend
from html import escape
from email.message import EmailMessage
from flask import Flask, render_template, request
app = Flask(__name__)

def send_email_notification(name, email, message):
    api_key = os.getenv("RESEND_API_KEY")
    recipient = os.getenv("MAIL_RECIPIENT")

    if not api_key or not recipient:
        raise RuntimeError("Resend API key or recipient is missing.")

    resend.api_key = api_key

    params = {
        "from": "Portfolio Contact <onboarding@resend.dev>",
        "to": [recipient],
        "subject": f"New portfolio message from {name}",
        "html": f"""
            <h2>New Portfolio Contact Message</h2>
            <p><strong>Name:</strong> {escape(name)}</p>
            <p><strong>Email:</strong> {escape(email)}</p>
            <p><strong>Message:</strong></p>
            <p>{escape(message).replace(chr(10), '<br>')}</p>
        """,
        "reply_to": email
    }

    return resend.Emails.send(params)
# Database file location
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE = os.path.join(BASE_DIR, "portfolio.db")


# Create the database table
def init_db():
    with sqlite3.connect(DATABASE) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


# Home page
@app.route("/")
def home():
    return render_template("index.html")


# About page
@app.route("/about")
def about():
    return render_template("about.html")


# Skills page
@app.route("/skills")
def skills():
    return render_template("skills.html")


# Projects page
@app.route("/projects")
def projects():
    return render_template("projects.html")


# Certifications page
@app.route("/certifications")
def certifications():
    return render_template("certifications.html")


# Education page
@app.route("/education")
def education():
    return render_template("education.html")


# Contact page and form processing

@app.route("/contact", methods=["GET", "POST"])
def contact():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        message = request.form.get("message", "").strip()

        if not name or not email or not message:
            return render_template(
                "contact.html",
                error="Please fill in all fields."
            ), 400

        if len(name) > 100 or len(email) > 254 or len(message) > 5000:
            return render_template(
                "contact.html",
                error="One or more fields exceed the allowed length."
            ), 400

        if "@" not in email or "." not in email.split("@")[-1]:
            return render_template(
                "contact.html",
                error="Please enter a valid email address."
            ), 400

        # Save the message to the database first
        with sqlite3.connect(DATABASE) as conn:
            conn.execute(
                """
                INSERT INTO contact_messages (name, email, message)
                VALUES (?, ?, ?)
                """,
                (name, email, message)
            )

        # Send the email notification
        try:
            send_email_notification(name, email, message)

        except Exception:
            app.logger.exception(
                "Contact message saved, but email notification failed."
            )

            return render_template(
                "contact.html",
                success="Your message was saved, but the email notification "
                        "could not be sent. Please try again later."
            )

        return render_template(
            "contact.html",
            success="Your message was saved and an email notification was sent."
        )

    return render_template("contact.html")


# Create database and table when the app starts
init_db()


if __name__ == "__main__":
    app.run(debug=True)
