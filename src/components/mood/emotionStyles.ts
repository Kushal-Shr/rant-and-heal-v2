import type { MoodEmotion } from "@/src/lib/mood/schema";

type EmotionVisual = {
  icon: string;
  idle: string;
  selected: string;
  badge: string;
  wash: string;
};

export const MOOD_EMOTION_VISUALS: Record<MoodEmotion, EmotionVisual> = {
  happy: {
    icon: "sentiment_satisfied",
    idle: "border-[#ead9aa] bg-[#fffaf0] text-[#624f26] hover:bg-[#fff3cf]",
    selected: "border-[#d0ab57] bg-[#fff0bf] text-[#594415] shadow-[0_8px_20px_rgba(163,124,39,0.12)]",
    badge: "bg-[#ffe49a] text-[#6a5014]",
    wash: "border-[#ead9aa] bg-[#fffaf0]",
  },
  sad: {
    icon: "sentiment_dissatisfied",
    idle: "border-[#d8cedf] bg-[#faf7fb] text-[#61556c] hover:bg-[#f1ebf4]",
    selected: "border-[#b8a9c3] bg-[#ece7f0] text-[#55455f] shadow-[0_8px_20px_rgba(105,86,119,0.12)]",
    badge: "bg-[#ded3e5] text-[#5d4d68]",
    wash: "border-[#d8cedf] bg-[#faf7fb]",
  },
  anxious: {
    icon: "waves",
    idle: "border-[#edd3c0] bg-[#fff9f5] text-[#704b37] hover:bg-[#ffede0]",
    selected: "border-[#d6a987] bg-[#ffe3cd] text-[#673c27] shadow-[0_8px_20px_rgba(151,99,64,0.12)]",
    badge: "bg-[#ffd2ae] text-[#76452d]",
    wash: "border-[#edd3c0] bg-[#fff9f5]",
  },
  angry: {
    icon: "mode_heat",
    idle: "border-[#ebd0cd] bg-[#fff8f7] text-[#7b3c3f] hover:bg-[#ffe9e6]",
    selected: "border-[#d9a09a] bg-[#ffdad6] text-[#83000a] shadow-[0_8px_20px_rgba(147,0,10,0.1)]",
    badge: "bg-[#ffc5c0] text-[#83000a]",
    wash: "border-[#ebd0cd] bg-[#fff8f7]",
  },
  calm: {
    icon: "spa",
    idle: "border-[#cbded3] bg-[#f7fbf8] text-[#36594c] hover:bg-[#e8f3ed]",
    selected: "border-[#8fb29f] bg-[#c6ebda] text-[#244b3d] shadow-[0_8px_20px_rgba(50,83,71,0.12)]",
    badge: "bg-[#ace0ca] text-[#244b3d]",
    wash: "border-[#cbded3] bg-[#f7fbf8]",
  },
  tired: {
    icon: "bedtime",
    idle: "border-[#ded8cc] bg-[#fbfaf7] text-[#625b4f] hover:bg-[#f2eee6]",
    selected: "border-[#beb4a3] bg-[#eee8db] text-[#554d40] shadow-[0_8px_20px_rgba(91,79,61,0.1)]",
    badge: "bg-[#ddd4c2] text-[#594f40]",
    wash: "border-[#ded8cc] bg-[#fbfaf7]",
  },
  lonely: {
    icon: "person",
    idle: "border-[#e2d8cc] bg-[#fdfaf7] text-[#695847] hover:bg-[#f7eee5]",
    selected: "border-[#c9ad94] bg-[#f5e3d6] text-[#654832] shadow-[0_8px_20px_rgba(121,88,65,0.1)]",
    badge: "bg-[#ead0bd] text-[#654832]",
    wash: "border-[#e2d8cc] bg-[#fdfaf7]",
  },
  stressed: {
    icon: "storm",
    idle: "border-[#ead0c8] bg-[#fff8f5] text-[#74453b] hover:bg-[#ffebe4]",
    selected: "border-[#d4a092] bg-[#ffddd3] text-[#713327] shadow-[0_8px_20px_rgba(130,65,47,0.11)]",
    badge: "bg-[#ffcbbd] text-[#783b2e]",
    wash: "border-[#ead0c8] bg-[#fff8f5]",
  },
  hopeful: {
    icon: "wb_sunny",
    idle: "border-[#d4dfbd] bg-[#fafcf5] text-[#52613d] hover:bg-[#eef4df]",
    selected: "border-[#aabe82] bg-[#e4ecd9] text-[#40572f] shadow-[0_8px_20px_rgba(81,109,57,0.11)]",
    badge: "bg-[#cfe0b8] text-[#40572f]",
    wash: "border-[#d4dfbd] bg-[#fafcf5]",
  },
  overwhelmed: {
    icon: "blur_on",
    idle: "border-[#d5d1df] bg-[#faf9fc] text-[#5b5568] hover:bg-[#efedf4]",
    selected: "border-[#b4a9c4] bg-[#e9e4ef] text-[#51485f] shadow-[0_8px_20px_rgba(89,75,105,0.11)]",
    badge: "bg-[#d8d0e3] text-[#51485f]",
    wash: "border-[#d5d1df] bg-[#faf9fc]",
  },
  excited: {
    icon: "celebration",
    idle: "border-[#ebd2b4] bg-[#fff9f1] text-[#704b24] hover:bg-[#ffebd1]",
    selected: "border-[#d9a86e] bg-[#ffdcbf] text-[#6b411e] shadow-[0_8px_20px_rgba(153,96,42,0.12)]",
    badge: "bg-[#ffc990] text-[#744719]",
    wash: "border-[#ebd2b4] bg-[#fff9f1]",
  },
  neutral: {
    icon: "sentiment_neutral",
    idle: "border-[#d9dbd4] bg-[#fafbf9] text-[#555b54] hover:bg-[#eef1eb]",
    selected: "border-[#adb5aa] bg-[#e5e9e2] text-[#434b43] shadow-[0_8px_20px_rgba(73,82,73,0.1)]",
    badge: "bg-[#d4dbd1] text-[#465047]",
    wash: "border-[#d9dbd4] bg-[#fafbf9]",
  },
};
