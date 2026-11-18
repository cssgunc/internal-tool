import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold text-navy">CSSG Internal Tool</h1>
        <p className="mt-2 text-neutral-600">
          Internal tooling and recruiting workflows for CS + Social Good at UNC.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/checkin"
          className="rounded-lg bg-navy px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-navy/90"
        >
          Public: Join Interested List
        </Link>
        <Link
          href="/semesters"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-center text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          Semesters List
        </Link>
      </div>

      <p className="text-sm text-neutral-500">
        API check: <code className="rounded bg-neutral-100 px-1">/api/v1/health</code>
      </p>
    </main>
  );
}
