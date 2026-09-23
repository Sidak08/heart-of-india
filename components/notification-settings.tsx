"use client";

import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

function publicKeyBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4); const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function deviceId() {
  const key = "hoi-operator-device-id"; let value = localStorage.getItem(key); if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); } return value;
}

export function playOrderTone() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return; const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(660, context.currentTime); oscillator.frequency.setValueAtTime(880, context.currentTime + .12); gain.gain.setValueAtTime(.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(.16, context.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .32); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .34); oscillator.addEventListener("ended", () => void context.close());
  } catch { /* Sound is an optional enhancement. */ }
}

export function NotificationSettings({ publicKey, configured }: { publicKey: string; configured: boolean }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default"); const [subscribed, setSubscribed] = useState(false); const [sound, setSound] = useState(true); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { setPermission("Notification" in window && "serviceWorker" in navigator ? Notification.permission : "unsupported"); setSound(localStorage.getItem("hoi-dashboard-sound") !== "off"); });
    if ("serviceWorker" in navigator) void navigator.serviceWorker.getRegistration().then((registration) => registration?.pushManager.getSubscription()).then((subscription) => setSubscribed(Boolean(subscription)));
  }, []);
  async function enable() {
    setPending(true); setMessage("");
    try {
      if (!configured || !publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Web Push is not available or configured.");
      const result = await Notification.requestPermission(); setPermission(result); if (result !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(publicKey) }); const json = subscription.toJSON();
      const response = await fetch("/api/operator/push-subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId(), endpoint: subscription.endpoint, keys: json.keys }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Notifications could not be enabled.");
      setSubscribed(true); setMessage("New-order notifications are enabled on this device."); playOrderTone();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Notifications could not be enabled."); }
    finally { setPending(false); }
  }
  async function disable() {
    setPending(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration(); const subscription = await registration?.pushManager.getSubscription(); await subscription?.unsubscribe();
      const response = await fetch("/api/operator/push-subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId() }) }); if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Notifications could not be disabled."); }
      setSubscribed(false); setMessage("Notifications are disabled on this device.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Notifications could not be disabled."); }
    finally { setPending(false); }
  }
  async function test() {
    setPending(true); setMessage(""); try { const response = await fetch("/api/operator/push-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Test notification failed."); setMessage("A test notification was sent."); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Test notification failed."); } finally { setPending(false); }
  }
  const toggleSound = () => { const next = !sound; setSound(next); localStorage.setItem("hoi-dashboard-sound", next ? "on" : "off"); if (next) playOrderTone(); };
  return <section className="operator-card notification-settings"><div><h2>New-order notifications</h2><p>Enable alerts separately on each phone, tablet, or computer used for orders.</p></div>{!configured && <div className="preview-block"><strong>Web Push needs VAPID keys.</strong><span>Add the three VAPID environment variables, redeploy, then return here.</span></div>}{permission === "unsupported" && <div className="inline-error">This browser does not support Web Push.</div>}<div className="notification-actions">{subscribed ? <><button className="button-secondary" type="button" onClick={test} disabled={pending}><Bell size={18} /> Send test</button><button className="button-secondary" type="button" onClick={disable} disabled={pending}><BellOff size={18} /> Disable on this device</button></> : <button className="button-primary" type="button" onClick={enable} disabled={pending || !configured}><Bell size={18} /> {pending ? "Enabling…" : "Enable on this device"}</button>}<button className="button-secondary" type="button" onClick={toggleSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />} Dashboard sound {sound ? "on" : "off"}</button></div>{message && <p className="summary-note" role="status">{message}</p>}</section>;
}
