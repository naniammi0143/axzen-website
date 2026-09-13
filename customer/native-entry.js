import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// This entry is bundled only into the Android app; website assets stay independent.
window.AxzenNative = {
  app: App,
  async share(data) { await Share.share({ ...data, dialogTitle: 'Share this store' }); },
  async open(url) {
    const target = new URL(url);
    if (target.protocol !== 'https:') throw new Error('This link cannot be opened.');
    await Browser.open({ url: target.href, toolbarColor: '#102A43' });
  },
  async signOut() {
    if (Capacitor.isPluginAvailable('FirebaseAuthentication')) await FirebaseAuthentication.signOut();
  },
  async confirmPhone(verificationId, verificationCode) {
    await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode });
    return (await FirebaseAuthentication.getIdToken()).token;
  },
  async startPhone(phoneNumber, callbacks) {
    if (!Capacitor.isPluginAvailable('FirebaseAuthentication')) {
      throw new Error('Phone sign-in is temporarily unavailable. Please use axzen.in or try again later.');
    }
    const handles = [];
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      await Promise.all(handles.map(h => h.remove()));
    };
    handles.push(await FirebaseAuthentication.addListener('phoneCodeSent', e => {
      if (!stopped) callbacks.sent(e.verificationId);
    }));
    handles.push(await FirebaseAuthentication.addListener('phoneVerificationCompleted', async () => {
      if (stopped) return;
      await stop();
      try { callbacks.complete((await FirebaseAuthentication.getIdToken()).token); }
      catch (error) { callbacks.failed(error); }
    }));
    handles.push(await FirebaseAuthentication.addListener('phoneVerificationFailed', async e => {
      if (stopped) return;
      await stop();
      callbacks.failed(new Error(e.message || 'Verification failed. Please try again.'));
    }));
    try { await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber }); }
    catch (error) { await stop(); throw error; }
    return stop;
  }
};
await import('./app.js');
