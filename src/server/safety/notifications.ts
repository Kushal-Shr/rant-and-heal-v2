import { Resend } from "resend";

type SupportNotificationResult = "CONFIRMED" | "FAILED";

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

export function safetySupportNotificationsEnabled(): boolean {
  return isEnabled(process.env.SAFETY_SUPPORT_NOTIFICATIONS_ENABLED);
}

/**
 * Sends deliberately minimal operational metadata. It never includes chat
 * text, a user name, a phone number, or a user ID. A delivery failure must
 * never change the crisis response shown to the user.
 */
export async function notifySafetySupport(options: {
  eventId: string;
  category?: string;
  source: "TEXT" | "VOICE";
  state: "IMMINENT" | "MEDICAL_EMERGENCY";
}): Promise<SupportNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SAFETY_ALERT_FROM_EMAIL?.trim();
  const recipient = process.env.SAFETY_SUPPORT_ALERT_EMAIL?.trim();

  if (!apiKey || !from || !recipient) {
    console.error("SAFETY SUPPORT NOTIFICATION FAILED: missing Resend configuration.");
    return "FAILED";
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [recipient],
      subject: "[Rant & Heal] Safety event recorded",
      text: `Safety event recorded\nEvent: ${options.eventId}\nCategory: ${options.category ?? "not provided"}\nSource: ${options.source}\nState: ${options.state}\nTimestamp: ${new Date().toISOString()}\n\nThis is a minimal operational alert. It does not contain the user's message or identity, and it does not mean Rant & Heal is a monitored or emergency-response service.`,
    });
    if (error) {
      console.error("SAFETY SUPPORT NOTIFICATION FAILED:", error);
      return "FAILED";
    }
    return "CONFIRMED";
  } catch (error) {
    console.error("SAFETY SUPPORT NOTIFICATION FAILED:", error);
    return "FAILED";
  }
}
