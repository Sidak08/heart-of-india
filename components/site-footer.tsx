import Link from "next/link";

export function SiteFooter({ name = "Heart of India", tagline = "Authentic Indian Restaurant", phone = "+19055005382", address = { street: "89 Clarence St.", city: "Brampton", province: "ON", postalCode: "L6W 1S5", country: "CA" }, publicEmail }: { name?: string; tagline?: string; phone?: string; address?: { street: string; city: string; province: string; postalCode: string; country: string }; publicEmail?: string | null }) {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${address.street} ${address.city} ${address.province} ${address.postalCode}`)}`;
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div><h2>{name}</h2><p>{tagline}</p><p>{address.street}<br />{address.city}, {address.province} {address.postalCode}</p></div>
          <div><h3>Explore</h3><div className="footer-links"><Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/about">About Us</Link><Link href="/cart">Cart</Link><Link href="/operator" prefetch={false}>Operator sign in</Link></div></div>
          <div><h3>Contact</h3><div className="footer-links"><a href={`tel:${phone}`}>{phone === "+19055005382" ? "905-500-5382" : phone}</a>{publicEmail && <a href={`mailto:${publicEmail}`}>{publicEmail}</a>}<a href={directions} target="_blank" rel="noreferrer">Get directions</a><Link href="/privacy">Privacy policy</Link><Link href="/ordering-policy">Ordering & pickup policy</Link></div></div>
        </div>
        <div className="footer-bottom">© {new Date().getFullYear()} {name}. All rights reserved.</div>
      </div>
    </footer>
  );
}
