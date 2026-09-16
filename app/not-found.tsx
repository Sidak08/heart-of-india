import Link from "next/link";
export default function NotFound() { return <main className="container empty-page"><h1 className="display">Page not found</h1><p>The page you requested is not available.</p><Link className="button-primary" href="/">Return home</Link></main>; }
