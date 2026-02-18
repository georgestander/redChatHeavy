export default function DocsPage() {
  const docsUrl = "https://chatjs.mintlify.dev/docs";

  return (
    <>
      <title>Docs</title>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-semibold text-3xl">Documentation</h1>
        <p className="mt-2 text-muted-foreground">
          Docs are available at{" "}
          <a className="underline underline-offset-4" href={docsUrl}>
            {docsUrl}
          </a>
          .
        </p>
      </div>
    </>
  );
}
