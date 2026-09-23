/** Maps Supabase Auth error codes to `auth.errors.*` translation keys. */
export function authErrorKey(code: string | undefined, message?: string): string {
  switch (code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "userExists";
    case "weak_password":
      return "weakPassword";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rateLimited";
    case "same_password":
      return "samePassword";
    case "otp_expired":
    case "flow_state_expired":
      return "linkExpired";
    case "signup_disabled":
      return "signupDisabled";
    default:
      if (message?.toLowerCase().includes("rate limit")) return "rateLimited";
      return "generic";
  }
}
