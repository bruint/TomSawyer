import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Boat, RiverScene } from "./brand";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field } from "./log-dialog";
import { post } from "../lib/api";

export function AuthScreen({
  needsSetup,
  keyRequired,
  invite,
  onSuccess,
}: {
  needsSetup: boolean;
  keyRequired: boolean;
  invite: string | null;
  onSuccess: () => void;
}) {
  const [join, setJoin] = useState(!!invite);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const setup = needsSetup && !join;
  const creating = setup || join;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post(
        setup ? "/auth/setup" : join ? "/auth/join" : "/auth/login",
        data,
      );
      history.replaceState(null, "", location.pathname);
      onSuccess();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <div className="auth-story">
        <a className="brand" href="/">
          <Boat />
          <span>
            TomSawyer<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="auth-copy">
          <span className="eyebrow">LITTLE DAYS. BIG ADVENTURES.</span>
          <h1>
            A little more rest.
            <br />
            <em>A plan for the rest.</em>
          </h1>
          <p>
            For the naps that end early. The mornings that start late. And all
            the lovely, messy moments in between.
          </p>
          <div className="auth-benefits">
            {[
              "A sleep strategy that moves with your day",
              "Every caregiver on the same page",
              "Your family’s data, on your own server",
            ].map((t) => (
              <div key={t}>
                <Check size={16} />
                {t}
              </div>
            ))}
          </div>
        </div>
        <RiverScene />
        <span className="auth-footer">Made for your family. Owned by you.</span>
      </div>
      <div className="auth-form-side">
        <div className="auth-form">
          <span className="eyebrow">
            WELCOME {creating ? "ABOARD" : "BACK"}
          </span>
          <h2>
            {setup
              ? "Your family starts here."
              : join
                ? "A place in the crew."
                : "Good to see you."}
          </h2>
          <p className="muted">
            {setup
              ? "Set up your private little corner of the world."
              : join
                ? "Create your own account to share the little moments."
                : "Sign in and pick up where your day left off."}
          </p>
          <form onSubmit={submit} className="form-stack">
            {creating && (
              <Field label="Your name">
                <Input
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="First name"
                  maxLength={60}
                />
              </Field>
            )}
            {setup && (
              <Field label="Family name">
                <Input
                  name="familyName"
                  required
                  placeholder="The Sawyer family"
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="Email address">
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="Password"
              hint={
                creating
                  ? "At least 12 characters. A few memorable words work well."
                  : undefined
              }
            >
              <div className="password-field">
                <Input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={creating ? "new-password" : "current-password"}
                  required
                  minLength={creating ? 12 : 1}
                  maxLength={128}
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            {setup && keyRequired && (
              <Field
                label="Server setup key"
                hint="The SETUP_TOKEN from your installation’s .env file."
              >
                <Input
                  name="setupToken"
                  type="password"
                  required
                  autoComplete="off"
                />
              </Field>
            )}
            {join && (
              <Field label="Invitation code">
                <Input
                  name="invite"
                  defaultValue={invite || ""}
                  autoComplete="off"
                  required
                />
              </Field>
            )}
            <Button size="lg" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : null}
              {setup
                ? "Create your family"
                : join
                  ? "Join the family"
                  : "Sign in"}
              <ArrowRight />
            </Button>
          </form>
          {!needsSetup && (
            <div className="auth-links">
              <button onClick={() => setJoin(!join)}>
                {join
                  ? "Already have an account? Sign in"
                  : "Have an invitation? Join your family"}
              </button>
              {!join && (
                <button onClick={() => setForgot(!forgot)}>
                  Forgot your password?
                </button>
              )}
            </div>
          )}
          {forgot && (
            <p className="notice">
              Ask the server owner to run the password reset command in the
              installation guide. No email service or third-party account is
              required.
            </p>
          )}
          <p className="auth-privacy">
            <span className="status-dot" />
            Self-hosted. No subscriptions. No trackers.
          </p>
        </div>
      </div>
    </div>
  );
}
