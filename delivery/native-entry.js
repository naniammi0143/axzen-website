import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

window.AxzenDeliveryNative = {
  phone: __AXZEN_NATIVE_PHONE__,
  async open(url) {
    const target = new URL(url);
    if (target.protocol !== "https:") throw new Error("This link cannot be opened.");
    await Browser.open({ url: target.href, toolbarColor: "#102A43" });
  },
  async signOut() {
    if (Capacitor.isPluginAvailable("FirebaseAuthentication")) await FirebaseAuthentication.signOut();
  },
  async confirmPhone(verificationId, verificationCode) {
    await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode });
    return (await FirebaseAuthentication.getIdToken()).token;
  },
  async startPhone(phoneNumber, callbacks) {
    if (!__AXZEN_NATIVE_PHONE__ || !Capacitor.isPluginAvailable("FirebaseAuthentication"))
      throw new Error("Phone sign-in is unavailable in this build. Contact Axzen support.");
    const handles = [];
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      await Promise.all(handles.map((handle) => handle.remove()));
    };
    handles.push(await FirebaseAuthentication.addListener("phoneCodeSent", (event) => {
      if (!stopped) callbacks.sent(event.verificationId);
    }));
    handles.push(await FirebaseAuthentication.addListener("phoneVerificationCompleted", async () => {
      if (stopped) return;
      await stop();
      try { callbacks.complete((await FirebaseAuthentication.getIdToken()).token); }
      catch (error) { callbacks.failed(error); }
    }));
    handles.push(await FirebaseAuthentication.addListener("phoneVerificationFailed", async (event) => {
      if (stopped) return;
      await stop();
      callbacks.failed(new Error(event.message || "Verification failed."));
    }));
    try { await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber }); }
    catch (error) { await stop(); throw error; }
    return stop;
  },
};

App.addListener("backButton", ({ canGoBack }) => {
  if (document.querySelector("dialog[open]")) return document.querySelector("dialog[open]").close();
  if (canGoBack) history.back();
  else App.minimizeApp();
});

await import("./update-loader.js");
