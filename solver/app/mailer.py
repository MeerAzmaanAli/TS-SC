import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger("notifications")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "notifications@ts-sc.local")


def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    body_html: str,
    body_text: str | None = None,
) -> bool:
    """Send an email to a faculty member.

    If SMTP credentials are not configured, logs the message clearly to the console
    for dev/testing and returns True.
    """
    if not to_email:
        logger.warning("send_email called with empty recipient email")
        return False

    if not body_text:
        body_text = body_html.replace("<br>", "\n").replace("<p>", "").replace("</p>", "\n")

    if not SMTP_HOST:
        print("\n" + "=" * 60)
        print(f"📧 [DEV EMAIL DISPATCH] -> {to_name} <{to_email}>")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(body_text.strip())
        print("=" * 60 + "\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"TS-SC Notifications <{FROM_EMAIL}>"
        msg["To"] = f"{to_name} <{to_email}>"

        part1 = MIMEText(body_text, "plain", "utf-8")
        part2 = MIMEText(body_html, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            if SMTP_PORT == 587:
                server.starttls()
            if SMTP_USER and SMTP_PASS:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())

        logger.info("Email delivered to %s", to_email)
        return True
    except Exception as exc:
        logger.error("Failed to deliver email to %s: %s", to_email, exc)
        return False

