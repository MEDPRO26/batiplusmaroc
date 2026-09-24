import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AuthFooter } from "@/features/auth/components/auth-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[#f2f4f6]">
      <div className="absolute top-4 end-4 z-20 sm:top-5 sm:end-6">
        <LanguageSwitcher />
      </div>
      <main className="flex flex-1 flex-col" id="contenu">
        {children}
      </main>
      <AuthFooter />
    </div>
  );
}
