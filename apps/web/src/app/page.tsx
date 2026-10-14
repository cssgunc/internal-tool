export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold text-navy">CSSG Internal Tool</h1>
      <p className="text-neutral-600">
        Placeholder home page. Pages get built from the TDD and the UI team&apos;s designs.
      </p>
      <p className="text-sm text-neutral-500">
        API check: <code className="rounded bg-neutral-100 px-1">/api/v1/health</code>
      </p>
    </main>
  );
}
