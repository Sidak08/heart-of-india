"use client";

import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";

type PushCapability = "checking" | "ready" | "install-ios" | "insecure" | "unsupported";

function detectPushCapability(): PushCapability {
  const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!window.isSecureContext) return "insecure";
  if (iosDevice && !standalone) return "install-ios";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "ready";
}

function capabilityError(capability: PushCapability) {
  if (capability === "install-ios") return "Install Heart of India to this iPhone’s Home Screen, then open the installed app to enable notifications.";
  if (capability === "insecure") return "Web Push requires the HTTPS version of this site.";
  return "Web Push is not supported in this browser or browsing mode.";
}

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
  const [capability, setCapability] = useState<PushCapability>("checking"); const [permission, setPermission] = useState<NotificationPermission>("default"); const [subscribed, setSubscribed] = useState(false); const [sound, setSound] = useState(true); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  useEffect(() => {
    const detected = detectPushCapability();
    queueMicrotask(() => { setCapability(detected); if (detected === "ready") setPermission(Notification.permission); setSound(localStorage.getItem("hoi-dashboard-sound") !== "off"); });
    if (detected === "ready") void (async () => { const registration = await navigator.serviceWorker.getRegistration(); const subscription = await registration?.pushManager.getSubscription(); if (!subscription) { setSubscribed(false); return; } try { const response = await fetch(`/api/operator/push-subscriptions?deviceId=${encodeURIComponent(deviceId())}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok || !data.registered) { await subscription.unsubscribe(); setSubscribed(false); setMessage("This browser subscription was not registered with the restaurant. Enable notifications again to repair it."); } else setSubscribed(true); } catch { setSubscribed(false); setMessage("Notification registration could not be verified. Try enabling it again."); } })();
  }, []);
  async function enable() {
    setPending(true); setMessage("");
    try {
      if (!configured || !publicKey) throw new Error("Web Push is not configured.");
      const detected = detectPushCapability(); if (detected !== "ready") throw new Error(capabilityError(detected));
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
    setPending(true); setMessage(""); try { const response = await fetch("/api/operator/push-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceId() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Test notification failed."); setMessage("The push service accepted the test. Your browser and operating system control whether it appears on screen."); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Test notification failed."); } finally { setPending(false); }
  }
  const toggleSound = () => { const next = !sound; setSound(next); localStorage.setItem("hoi-dashboard-sound", next ? "on" : "off"); if (next) playOrderTone(); };
  return <section className="operator-card notification-settings"><div><h2>New-order notifications</h2><p>Enable alerts separately on each phone, tablet, or computer used for orders.</p></div>{!configured && <div className="preview-block"><strong>Web Push needs VAPID keys.</strong><span>Add the three VAPID environment variables, redeploy, then return here.</span></div>}{capability === "install-ios" && <div className="preview-block notification-install-help"><strong>Install Heart of India on this iPhone or iPad</strong><span>Apple only enables Web Push inside the installed Home Screen app.</span><ol><li>In Safari, tap the Share button.</li><li>Choose <strong>Add to Home Screen</strong>, then confirm.</li><li>Open Heart of India from the new Home Screen icon.</li><li>Sign in, return to Notifications, and enable this device.</li></ol></div>}{capability === "insecure" && <div className="inline-error"><strong>HTTPS is required for notifications.</strong><span>Open the deployed <code>https://</code> address directly, then try again.</span></div>}{capability === "unsupported" && <div className="inline-error"><strong>Web Push is unavailable in this browser or mode.</strong><span>Try a current browser outside Private Browsing. On iPhone and iPad, use the installed Home Screen app.</span></div>}{capability === "ready" && permission === "denied" && <div className="inline-error"><strong>Notification permission is blocked.</strong><span>Allow notifications for Heart of India in the device or browser settings, then reopen this page.</span></div>}<div className="notification-actions">{capability === "ready" && (subscribed ? <><button className="button-secondary" type="button" onClick={test} disabled={pending}><Bell size={18} /> Send test</button><button className="button-secondary" type="button" onClick={disable} disabled={pending}><BellOff size={18} /> Disable on this device</button></> : <button className="button-primary" type="button" onClick={enable} disabled={pending || !configured}><Bell size={18} /> {pending ? "Enabling…" : "Enable on this device"}</button>)}<button className="button-secondary" type="button" onClick={toggleSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />} Dashboard sound {sound ? "on" : "off"}</button></div>{message && <p className="summary-note" role="status">{message}</p>}</section>;
}
