import { Avatar } from "../ui/Avatar";

export interface ChatBubbleProps {
  message: string;
  align?: "sender" | "receiver";
  senderName?: string;
  avatarSrc?: string;
  timestamp?: string;
  isTyping?: boolean;
}

export function ChatBubble({
  align = "receiver",
  avatarSrc,
  isTyping = false,
  message,
  senderName = "Momo",
  timestamp,
}: ChatBubbleProps) {
  const isSender = align === "sender";

  return (
    <div className={`flex max-w-[85%] gap-4 ${isSender ? "self-end" : "items-start self-start"}`}>
      {!isSender ? <Avatar alt={senderName} src={avatarSrc} size="sm" /> : null}
      <div>
        <div
          className={`rounded-2xl p-4 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] shadow-sm ${
            isSender
              ? "rounded-br-none bg-[#ffdcc6]/50 text-[#2d1605] shadow-[0_20px_40px_-15px_rgba(121,88,65,0.15)]"
              : "rounded-tl-none bg-[#c6ebda]/40 text-[#2d4d41]"
          }`}
        >
          {isTyping ? (
            <div className="flex gap-1 py-1">
              <span className="size-2 animate-bounce rounded-full bg-[#325347]/40" />
              <span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:150ms]" />
              <span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:300ms]" />
            </div>
          ) : (
            <p>{message}</p>
          )}
        </div>
        {timestamp ? (
          <p className={`mt-2 text-xs font-medium text-[#717974] ${isSender ? "text-right" : ""}`}>
            {timestamp}
          </p>
        ) : null}
      </div>
    </div>
  );
}

