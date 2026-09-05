export const primaryStaffEmails = ["vargasblancobrayan@gmail.com", "j.castro@unicall.io"];
export const primaryStaffUsernames = ["vargasblancobrayan", "j.castro"];

export function isPrimaryStaffIdentity(identity?: { email?: string | null; username?: string | null }) {
  const email = identity?.email?.trim().toLowerCase() || "";
  const username = identity?.username?.trim().toLowerCase() || "";
  return primaryStaffEmails.includes(email) || primaryStaffUsernames.includes(username);
}
