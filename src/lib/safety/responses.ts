import type { SafetyEvaluation } from "./schemas.ts";

export const SAFETY_COPY_APPROVAL_STATUS = "RESEARCH_DRAFT" as const;

function userPhrase(text: string): string {
  const compact = text
    .replace(/[?\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!;:]+$/g, "");
  return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}

function englishResponse(evaluation: SafetyEvaluation, messageText: string): string {
  if (evaluation.assessmentStep === "VERIFY_RETRACTED_CLAIM") {
    const retracted = /\b(?:jok(?:e|ing)|kidding|not serious)\b/i.test(messageText);
    if (evaluation.state === "MEDICAL_EMERGENCY") {
      return retracted
        ? "I hear that you’re saying it was a joke, but I need to verify the earlier medical claim. Are you actually injured or bleeding right now?"
        : "Before we switch topics, I need to verify what you told me earlier. Are you actually injured or bleeding right now?";
    }
    if (evaluation.state === "IMMINENT") {
      return retracted
        ? "I hear that you’re saying it was a joke, but I need to verify your current safety. Are you thinking about ending your life or acting on that statement right now?"
        : "Before we switch topics, I need to verify your current safety. Are you thinking about ending your life right now?";
    }
  }

  if (evaluation.assessmentStep === "AWAIT_HUMAN_REVIEW") {
    if (evaluation.state === "MEDICAL_EMERGENCY") {
      return "Thank you for clarifying. I can’t treat the earlier emergency statement as fully resolved from one answer alone. Are you currently safe and free from injury or bleeding?";
    }
    if (evaluation.state === "IMMINENT") {
      return "Thank you for clarifying. I can’t treat the earlier statement as resolved from one denial alone. Are you currently safe from acting on thoughts of ending your life?";
    }
  }

  if (evaluation.resolution === "UNRESOLVED") {
    if (evaluation.state === "IMMINENT") {
      return "I’m staying focused on your immediate safety. Move away from anything dangerous now. Reply when you have done that.";
    }
    if (evaluation.state === "MEDICAL_EMERGENCY") {
      return "This may need urgent medical help. Call your local emergency services or go to the nearest emergency department now. If you can, get someone nearby to help you.";
    }
    return "I hear that this is difficult to answer, and I won’t treat uncertainty as a no. Are you physically safe right now?";
  }

  switch (evaluation.state) {
    case "CLARIFY":
      return `It sounds like things feel overwhelming. When you say “${userPhrase(messageText)},” what do you mean?`;
    case "SELF_HARM":
      switch (evaluation.assessmentStep) {
        case "CHECK_ALREADY_ACTED":
          return "Thank you for explaining what you mean. I’m not going to minimize the urge because you don’t want to die. Have you already hurt yourself today?";
        case "MEDICAL_TRIAGE":
          return "Thank you for telling me you already hurt yourself. Is there serious bleeding, trouble breathing, loss of consciousness, or another injury that needs urgent medical help right now?";
        case "CHECK_CURRENT_IMMEDIACY":
          return "I’m glad you told me directly. Do you feel that you may hurt yourself now or very soon?";
        case "CHECK_SAFE_PERSON":
          return "Let’s keep the focus on getting through this safely. Is there someone you trust who can be with you while the urge is strong?";
        default:
          return "Thank you for telling me. I want to understand without assuming that self-harm means you want to die. Are you also thinking about ending your life, or do you want to hurt yourself without dying?";
      }
    case "SUICIDAL":
      if (evaluation.assessmentStep === "CHECK_SAFE_PERSON" || evaluation.assessmentStep === "AWAIT_HUMAN_REVIEW") {
        return "Thank you for telling me directly. I’m keeping the focus on safety rather than starting CBT. Is there someone you trust you can contact and stay connected with right now?";
      }
      return "Thank you for telling me directly. I’m keeping the focus on your safety rather than starting CBT. Do you feel that you might act on these thoughts now or today?";
    case "IMMINENT":
      if (evaluation.deterministic.category === "HARM_TO_OTHERS") {
        return "Move away from any weapon and from the person you might harm now. Reply when you have created distance.";
      }
      return "Move away from anything you could use to hurt yourself now. Reply when you have done that.";
    case "MEDICAL_EMERGENCY":
      return "You need urgent medical help now. Call your local emergency services, or ask someone nearby to call for you.";
    case "NORMAL":
      return "";
  }
}

function nepaliResponse(evaluation: SafetyEvaluation): string {
  if (evaluation.assessmentStep === "VERIFY_RETRACTED_CLAIM") {
    return evaluation.state === "MEDICAL_EMERGENCY"
      ? "तपाईंले पहिले भन्नुभएको चिकित्सा आपतकालीन कुरा पुष्टि गर्न आवश्यक छ। के तपाईं अहिले साँच्चै घाइते हुनुहुन्छ वा रगत बगिरहेको छ?"
      : "तपाईंको हालको सुरक्षा पुष्टि गर्न आवश्यक छ। के तपाईं अहिले आफ्नो जीवन अन्त्य गर्ने सोचअनुसार काम गर्ने अवस्थामा हुनुहुन्छ?";
  }
  if (evaluation.assessmentStep === "AWAIT_HUMAN_REVIEW") {
    return evaluation.state === "MEDICAL_EMERGENCY"
      ? "स्पष्ट पार्नुभएकोमा धन्यवाद। एउटा उत्तरकै आधारमा पहिलेको आपतकालीन कुरा पूर्ण रूपमा समाधान भएको मान्न सक्दिनँ। के तपाईं अहिले सुरक्षित र चोट वा रक्तस्रावबाट मुक्त हुनुहुन्छ?"
      : "स्पष्ट पार्नुभएकोमा धन्यवाद। एउटा अस्वीकारकै आधारमा पहिलेको कुरा समाधान भएको मान्न सक्दिनँ। के तपाईं अहिले आफ्नो जीवन अन्त्य गर्ने सोचअनुसार काम नगरी सुरक्षित रहन सक्नुहुन्छ?";
  }
  if (evaluation.state === "MEDICAL_EMERGENCY") {
    return "तपाईंलाई अहिले तुरुन्त चिकित्सा सहायता चाहिन सक्छ। स्थानीय आपतकालीन सेवामा फोन गर्नुहोस् वा नजिकको आपतकालीन उपचार केन्द्रमा जानुहोस्। सम्भव भए नजिकको विश्वासिलो व्यक्तिलाई मद्दतका लागि बोलाउनुहोस्।";
  }
  if (evaluation.state === "IMMINENT") {
    return "आफूलाई चोट पुर्‍याउन सक्ने वस्तुबाट अहिले टाढा जानुहोस्। त्यसो गरेपछि जवाफ दिनुहोस्।";
  }
  if (evaluation.state === "CLARIFY") {
    return "तपाईंलाई अहिले धेरै गाह्रो भइरहेको जस्तो सुनिन्छ। तपाईंले “अब सक्दिन” भन्नुहुँदा के भन्न खोज्नुभएको हो?";
  }
  if (evaluation.state === "SELF_HARM") {
    return evaluation.assessmentStep === "CHECK_ALREADY_ACTED" || evaluation.assessmentStep === "MEDICAL_TRIAGE"
      ? "मलाई स्पष्ट बताउनुभएकोमा धन्यवाद। के तपाईंले आज आफूलाई चोट पुर्‍याइसक्नुभएको छ?"
      : "मलाई बताउनुभएकोमा धन्यवाद। के तपाईंलाई आफ्नो जीवन अन्त्य गर्ने सोच पनि आएको छ, वा नमरीकन आफूलाई चोट पुर्‍याउन चाहनुभएको हो?";
  }
  return "मलाई सीधै बताउनुभएकोमा धन्यवाद। अहिले सामान्य CBT भन्दा तपाईंको सुरक्षा महत्त्वपूर्ण छ। के तपाईंलाई अहिले वा आज यी सोचअनुसार काम गर्न सक्छु जस्तो लाग्छ?";
}

export function safetyResponseFor(
  evaluation: SafetyEvaluation,
  options: { messageText?: string; language?: "EN" | "NE" } = {}
): string {
  const language = options.language ?? evaluation.deterministic.language ?? "EN";
  return language === "NE"
    ? nepaliResponse(evaluation)
    : englishResponse(evaluation, options.messageText ?? "this");
}
