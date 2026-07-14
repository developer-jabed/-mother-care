export const USER_ROLES = {
  ADMIN: "ADMIN",
  CUSTOMER: "CUSTOMER",
  VENDOR: "VENDOR",
} as const;

export const USER_SORTABLE_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "email",
] as const;

export const USER_FILTERABLE_FIELDS = [
  "email",
  "name",
  "role",
  "isActive",
  "isVerified",
] as const;

export const USER_SEARCHABLE_FIELDS = ["name", "email", "phone"] as const;