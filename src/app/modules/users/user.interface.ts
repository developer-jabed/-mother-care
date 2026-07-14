export interface ICreateUser {
  name: string;
  email: string;
  avatar?: string | undefined;
  phone?: string | undefined;
  role?: string | undefined;
}

export interface IUpdateUser {
  name?: string | undefined;
  phone?: string | undefined;
  avatar?: string | undefined;
}

export interface IUserFilter {
  search?: string | undefined;
  role?: string | undefined;
  isActive?: string | undefined;
  isVerified?: string | undefined;
}