import { AuthTopBar } from "@/features/auth/components/auth-top-bar";

export default function SignUpSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthTopBar />
      {children}
    </>
  );
}
