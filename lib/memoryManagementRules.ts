import type {
  MemoryManagementActionType,
  MemoryManagementInput,
  MemoryManagementReasonCode,
} from "./conversationTypes";

export const memoryManagementActions = new Set<MemoryManagementActionType>([
  "EDIT",
  "ARCHIVE",
  "RESTORE",
]);

export const memoryManagementReasonCodes = new Set<MemoryManagementReasonCode>([
  "user_edit",
  "user_archive",
  "user_restore",
  "conversation_correction",
  "conversation_forget",
]);

const allowedReasons: Record<MemoryManagementActionType, Set<MemoryManagementReasonCode>> = {
  EDIT: new Set(["user_edit", "conversation_correction"]),
  ARCHIVE: new Set(["user_archive", "conversation_forget"]),
  RESTORE: new Set(["user_restore"]),
};

export function isMemoryManagementAction(value: unknown): value is MemoryManagementActionType {
  return typeof value === "string" && memoryManagementActions.has(value as MemoryManagementActionType);
}

export function isMemoryManagementReasonCode(
  value: unknown,
): value is MemoryManagementReasonCode {
  return typeof value === "string" && memoryManagementReasonCodes.has(value as MemoryManagementReasonCode);
}

export function validateMemoryManagementInput(input: MemoryManagementInput) {
  if (!input.requestKey.trim() || input.requestKey.length > 120) {
    return "requestKey is invalid.";
  }
  if (!allowedReasons[input.action].has(input.reasonCode)) {
    return `reasonCode is not valid for ${input.action}.`;
  }
  if (input.action === "EDIT" && typeof input.reviewedContent !== "string") {
    return "EDIT requires reviewedContent.";
  }
  if (input.action !== "EDIT" && input.reviewedContent !== undefined) {
    return `${input.action} must not include reviewedContent.`;
  }
  return null;
}
