export interface ICreateFeeType {
  name: string;
  displayName: string;
  frequency?: 'MONTHLY' | 'YEARLY' | 'ONE_TIME' | 'PER_EXAM';
}

export interface ICreateFeeStructure {
  feeTypeId: number;
  academicYearId: number;
  classId: number;
  amount: number;
}

export interface IGenerateMonthlyFees {
  academicYearId: number;
  classId: number;
  month: number;
  year: number;
  dueDate?: string;
}

export interface IRecordPayment {
  studentFeeId: number;
  amount: number;
  receivedById?: number;
  remarks?: string;
}

export interface IFeeFilter {
  searchTerm?: string;
  studentEnrollmentId?: number;
  feeTypeId?: number;
  status?: string;
  month?: number;
  year?: number;
  classId?: number;
  sectionId?: number;
}

export interface IFeeDashboardFilter {
  academicYearId?: number;
  classId?: number;
  sectionId?: number;
  feeTypeId?: number;
  month?: number;
  year?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
}