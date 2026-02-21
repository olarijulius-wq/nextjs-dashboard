export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          404
        </p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Page not found</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The page you requested does not exist.
        </p>
      </div>
    </main>
  );
}
