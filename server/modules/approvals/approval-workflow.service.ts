import { TRPCError } from "@trpc/server";

export enum ApprovalStatus {
  PENDING = "pending",
  HR_APPROVED = "hr_approved",
  HR_REJECTED = "hr_rejected",
  FINANCE_APPROVED = "finance_approved",
  FINANCE_REJECTED = "finance_rejected",
  ACCOUNTANT_APPROVED = "accountant_approved",
  ACCOUNTANT_REJECTED = "accountant_rejected",
  PAID = "paid",
}

export enum ApprovalStage {
  HR = "hr",
  FINANCE = "finance",
  ACCOUNTANT = "accountant",
}

export interface ApprovalRequest {
  id: number;
  type: "payroll" | "incentive" | "bonus" | "advance";
  workerId: number;
  amount: number;
  description: string;
  status: ApprovalStatus;
  currentStage: ApprovalStage;
  hrApprovedAt?: Date;
  hrApprovedBy?: number;
  hrNotes?: string;
  financeApprovedAt?: Date;
  financeApprovedBy?: number;
  financeNotes?: string;
  accountantApprovedAt?: Date;
  accountantApprovedBy?: number;
  accountantNotes?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export async function submitToHRApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
  if (request.status !== ApprovalStatus.PENDING) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot submit non-pending request for approval",
    });
  }

  request.currentStage = ApprovalStage.HR;
  request.updatedAt = new Date();
  console.log(`Notification: New approval request for ${request.amount} SAR`);

  return request;
}

export async function approveByHR(
  request: ApprovalRequest,
  approvedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.HR) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in HR approval stage",
    });
  }

  request.status = ApprovalStatus.HR_APPROVED;
  request.hrApprovedAt = new Date();
  request.hrApprovedBy = approvedBy;
  request.hrNotes = notes;
  request.currentStage = ApprovalStage.FINANCE;
  request.updatedAt = new Date();

  console.log(`Notification: HR approved request for ${request.amount} SAR`);

  return request;
}

export async function rejectByHR(
  request: ApprovalRequest,
  rejectedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.HR) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in HR approval stage",
    });
  }

  request.status = ApprovalStatus.HR_REJECTED;
  request.hrApprovedAt = new Date();
  request.hrApprovedBy = rejectedBy;
  request.hrNotes = notes;
  request.updatedAt = new Date();

  console.log(`Notification: HR rejected the request`);

  return request;
}

export async function approveByFinanceReviewer(
  request: ApprovalRequest,
  approvedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.FINANCE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in Finance approval stage",
    });
  }

  request.status = ApprovalStatus.FINANCE_APPROVED;
  request.financeApprovedAt = new Date();
  request.financeApprovedBy = approvedBy;
  request.financeNotes = notes;
  request.currentStage = ApprovalStage.ACCOUNTANT;
  request.updatedAt = new Date();

  console.log(`Notification: Finance approved request for ${request.amount} SAR`);

  return request;
}

export async function rejectByFinanceReviewer(
  request: ApprovalRequest,
  rejectedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.FINANCE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in Finance approval stage",
    });
  }

  request.status = ApprovalStatus.FINANCE_REJECTED;
  request.financeApprovedAt = new Date();
  request.financeApprovedBy = rejectedBy;
  request.financeNotes = notes;
  request.updatedAt = new Date();

  console.log(`Notification: Finance rejected the request`);

  return request;
}

export async function approveAndPayByAccountant(
  request: ApprovalRequest,
  approvedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.ACCOUNTANT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in Accountant approval stage",
    });
  }

  request.status = ApprovalStatus.PAID;
  request.accountantApprovedAt = new Date();
  request.accountantApprovedBy = approvedBy;
  request.accountantNotes = notes;
  request.paidAt = new Date();
  request.updatedAt = new Date();

  console.log(`Notification: Payment of ${request.amount} SAR has been processed`);

  return request;
}

export async function rejectByAccountant(
  request: ApprovalRequest,
  rejectedBy: number,
  notes: string
): Promise<ApprovalRequest> {
  if (request.currentStage !== ApprovalStage.ACCOUNTANT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Request is not in Accountant approval stage",
    });
  }

  request.status = ApprovalStatus.ACCOUNTANT_REJECTED;
  request.accountantApprovedAt = new Date();
  request.accountantApprovedBy = rejectedBy;
  request.accountantNotes = notes;
  request.updatedAt = new Date();

  console.log(`Notification: Accountant rejected the request`);

  return request;
}

export function getApprovalStatus(request: ApprovalRequest): string {
  switch (request.status) {
    case ApprovalStatus.PENDING:
      return "Pending HR approval";
    case ApprovalStatus.HR_APPROVED:
      return "Approved by HR - Pending Finance review";
    case ApprovalStatus.HR_REJECTED:
      return "Rejected by HR";
    case ApprovalStatus.FINANCE_APPROVED:
      return "Approved by Finance - Pending Accountant approval";
    case ApprovalStatus.FINANCE_REJECTED:
      return "Rejected by Finance";
    case ApprovalStatus.ACCOUNTANT_APPROVED:
      return "Approved by Accountant - Ready for payment";
    case ApprovalStatus.ACCOUNTANT_REJECTED:
      return "Rejected by Accountant";
    case ApprovalStatus.PAID:
      return "Payment processed successfully";
    default:
      return "Unknown status";
  }
}
