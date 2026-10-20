export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-navy font-display text-xl text-navy-ink">A</span>
          <h1 className="text-2xl">English Academy</h1>
          <p className="mt-1 text-sm text-ink-2">Vocabulary that lasts. Writing that convinces.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
