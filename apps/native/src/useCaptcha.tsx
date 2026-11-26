import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import {completeCaptcha as completeBrowserCaptcha} from './captcha';
import {origin} from './client';
import {allowCaptchaNavigation, embeddedCaptchaUrl, isCaptchaPage, readCaptchaMessage} from './captcha-protocol';
import {Button, colors, styles} from './ui';

type Attempt = {state:string; browser:boolean; resolve:(token:string)=>void; reject:(error:Error)=>void};
export function useCaptcha() {
  const active=useRef<Attempt|null>(null);
  const [state,setState]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [browserBusy,setBrowserBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const web=useRef<WebView>(null);
  function cancel(){
    const attempt=active.current;active.current=null;
    setState(null);setBrowserBusy(false);
    attempt?.reject(new Error('Security check cancelled. Tap Sign in to try again.'));
  }
  function succeed(attempt:Attempt,token:string){
    if(active.current!==attempt)return;
    active.current=null;setState(null);setBrowserBusy(false);attempt.resolve(token);
  }
  useEffect(()=>()=>{
    const attempt=active.current;active.current=null;
    attempt?.reject(new Error('Sign-in closed. Please try again.'));
  },[]);
  useEffect(()=>{
    if(!state || browserBusy)return;
    const timer=setTimeout(()=>{
      if(active.current?.state===state && !active.current.browser){
        web.current?.stopLoading();setError('The security check is taking too long. Retry here or use the browser.');
      }
    },120000);
    return()=>clearTimeout(timer);
  },[state,browserBusy]);
  function retry(){
    if(!active.current||active.current.browser)return;
    active.current.state=Crypto.randomUUID();setError('');setLoading(true);setState(active.current.state);
  }
  async function browserFallback(){
    const attempt=active.current;if(!attempt||attempt.browser)return;
    // Ignore all messages from the embedded page once fallback starts.
    attempt.browser=true;web.current?.stopLoading();setBrowserBusy(true);setError('');
    try {const token=await completeBrowserCaptcha();succeed(attempt,token);}
    catch(e){
      if(active.current!==attempt)return;
      attempt.browser=false;setBrowserBusy(false);attempt.state=Crypto.randomUUID();setState(attempt.state);setLoading(true);
      setError(e instanceof Error?e.message:'Browser verification failed. Retry here or cancel.');
    }
  }
  function completeCaptcha():Promise<string>{
    if(active.current)return Promise.reject(new Error('A security check is already open.'));
    return new Promise((resolve,reject)=>{
      const nonce=Crypto.randomUUID();active.current={state:nonce,browser:false,resolve,reject};
      setState(nonce);setLoading(true);setError('');setBrowserBusy(false);
    });
  }
  const challenge=state?<Modal visible animationType="slide" onRequestClose={cancel} presentationStyle="fullScreen">
    <SafeAreaView style={styles.screen}>
      <View style={{padding:16,borderBottomWidth:1,borderColor:colors.border}}>
        <Text accessibilityRole="header" style={styles.title}>Security check</Text>
        <Text style={styles.small}>Once verified, sign-in continues automatically.</Text>
      </View>
      {browserBusy?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><ActivityIndicator color={colors.orange}/><Text style={styles.subtitle}>Complete the check in your browser.</Text></View>:<>
        {loading&&!error&&<View style={{padding:10}}><ActivityIndicator color={colors.orange}/><Text style={[styles.small,{textAlign:'center'}]}>Loading verification…</Text></View>}
        <WebView key={state} ref={web} source={{uri:embeddedCaptchaUrl(origin,state)}}
          style={{flex:1}} javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled
          sharedCookiesEnabled={false} cacheEnabled={false} incognito
          mixedContentMode="never" allowFileAccess={false} allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false} javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows onOpenWindow={()=>setError('Additional windows are blocked. Use browser verification if needed.')}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={request=>allowCaptchaNavigation(request.url,request.isTopFrame,origin,state)}
          onNavigationStateChange={navigation=>{
            if(navigation.url==='about:blank')return;
            if(!isCaptchaPage(navigation.url,origin,state)){web.current?.stopLoading();setError('Verification navigated away from MYLA. Retry or use the browser.');}
          }}
          onLoadEnd={()=>setLoading(false)}
          onError={()=>{setLoading(false);setError('Verification could not load. Check your connection, then retry or use the browser.');}}
          onHttpError={()=>{setLoading(false);setError('The verification service returned an error. Retry or use the browser.');}}
          onContentProcessDidTerminate={retry}
          onMessage={event=>{
            const attempt=active.current;if(!attempt||attempt.browser||attempt.state!==state)return;
            try{
              const message=readCaptchaMessage(event.nativeEvent.data,event.nativeEvent.url,origin,attempt.state);
              if('token' in message)succeed(attempt,message.token);
              else {setLoading(false);setError('Security verification is unavailable. Retry here or use the browser.');}
            }catch{setError('Could not verify the response. Retry the security check.');}
          }}/>
      </>}
      <View style={{padding:16,borderTopWidth:1,borderColor:colors.border}}>
        {!!error&&<Text accessibilityRole="alert" style={{color:colors.red,marginBottom:8}}>{error}</Text>}
        {!!error&&<Button title="Retry in app" secondary disabled={browserBusy} onPress={retry}/>}
        <Button title="Use browser instead" secondary disabled={browserBusy} onPress={browserFallback}/>
        <Button title="Cancel sign-in" secondary onPress={cancel}/>
      </View>
    </SafeAreaView>
  </Modal>:null;
  return {completeCaptcha,challenge};
}
