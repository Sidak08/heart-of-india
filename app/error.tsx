"use client";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="container empty-page"><h1 className="display">Something went wrong</h1><p>The page could not be loaded. Your locally saved cart has not been cleared.</p><button className="button-primary" onClick={reset}>Try again</button></main>; }
