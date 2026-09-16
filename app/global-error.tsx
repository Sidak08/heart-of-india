"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-CA">
      <body>
        <main className="container empty-page">
          <h1 className="display">Heart of India is temporarily unavailable</h1>
          <p>Please try loading the site again. Any cart saved in this browser has not been cleared.</p>
          <button className="button-primary" type="button" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
