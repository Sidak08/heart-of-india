import { ArrowRight, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MotionReveal } from "@/components/motion-reveal";
import { formatCad } from "@/lib/menu";
import { getPublicCatalogue } from "@/lib/server/public-menu";
import { displayHours, getPublicSettings } from "@/lib/server/public-settings";

const featuredIds = ["curries-butter-chicken", "biriyani-vegetable-biriyani", "tandoori-paneer-tikka", "special-combos-veg-curry-combo"];
export default async function HomePage() {
  const [settings, catalogue] = await Promise.all([getPublicSettings(), getPublicCatalogue()]);
  const featured = featuredIds.map((id) => catalogue.items.find((item) => item.id === id)).filter(Boolean);
  const hours = displayHours(settings.weeklyHours);
  const address = `${settings.address.street}, ${settings.address.city}, ${settings.address.province} ${settings.address.postalCode}`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return (
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">Brampton, Ontario</div>
              <h1>Warm Indian cooking, ready for pickup.</h1>
              <div className="tricolour-rule" aria-hidden="true"><span /><span /><span /></div>
              <p>Explore the {settings.name} menu, choose your favourites, and place a pickup order for payment at the restaurant from {settings.address.street.replace(/\.$/, "")}.</p>
              <div className="hero-actions"><Link className="button-primary" href="/menu">Order Online <ArrowRight size={19} /></Link><Link className="button-secondary" href="/menu">View Menu</Link></div>
            </div>
            <div className="hero-seal"><Image src="/heart-of-india-logo.png" alt="Heart of India - Authentic Indian Restaurant" width={1444} height={1444} priority /></div>
          </div>
        </section>
        <section className="band">
          <div className="container">
            <MotionReveal className="section-head"><div><div className="eyebrow">Something for the table</div><h2 className="section-title">Explore the Menu</h2><p>A small look across our curries, biriyani, tandoori dishes, and combinations.</p></div><Link className="button-secondary" href="/menu">See all {catalogue.items.length} items</Link></MotionReveal>
            <MotionReveal className="featured-grid" stagger>{featured.map((item) => item && <article className="dish-preview" key={item.id}><span className="eyebrow">{item.categoryId.replaceAll("-", " ")}</span><h3>{item.name}</h3><div className="price">{formatCad(item.priceCents)}</div></article>)}</MotionReveal>
          </div>
        </section>
        <section className="visit">
          <MotionReveal className="container visit-grid" stagger>
            <div className="intro-card"><div className="eyebrow">About the restaurant</div><h2 className="section-title">Authentic Indian Restaurant</h2><p>Heart of India serves a focused menu of thali, biriyani, appetizers, tandoori dishes, curries, sides, drinks, desserts, and special combinations in Brampton.</p><Link className="button-secondary" href="/about">About Us</Link></div>
            <div className="visit-card"><h2>Visit {settings.name}</h2><p>Pickup from our Clarence Street restaurant.</p><div className="detail-list"><a href={directions} target="_blank" rel="noreferrer"><MapPin size={22} /> <span>{settings.address.street}<br />{settings.address.city}, {settings.address.province} {settings.address.postalCode}</span></a><a href={`tel:${settings.phone}`}><Phone size={22} /> {settings.phone === "+19055005382" ? "905-500-5382" : settings.phone}</a></div>{hours.length ? <div className="compact-hours">{hours.map((row) => <span key={row.label}><b>{row.label}</b> {row.value}</span>)}</div> : <p className="hours-pending">Opening hours require owner confirmation. Please call before visiting.</p>}</div>
          </MotionReveal>
        </section>
      </main>
  );
}
