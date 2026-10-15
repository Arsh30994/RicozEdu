"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[794],{5794:function(t,e,n){n.d(e,{AudioEngine:function(){return s}});var r=`
class OmniCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let read = 0;
    while (read < channel.length) {
      const take = Math.min(channel.length - read, this.buffer.length - this.offset);
      this.buffer.set(channel.subarray(read, read + take), this.offset);
      this.offset += take;
      read += take;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('omni-capture', OmniCaptureProcessor);
`,s=class{constructor(){this.context=null,this.stream=null,this.workletNode=null,this.playhead=0,this.playing=[]}async start(t){this.stream=await navigator.mediaDevices.getUserMedia({audio:{sampleRate:16e3,channelCount:1,echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0}}),this.context=new AudioContext({sampleRate:16e3}),"suspended"===this.context.state&&await this.context.resume();let e=URL.createObjectURL(new Blob([r],{type:"application/javascript"}));try{await this.context.audioWorklet.addModule(e)}finally{URL.revokeObjectURL(e)}this.workletNode=new AudioWorkletNode(this.context,"omni-capture"),this.workletNode.port.onmessage=e=>{t(function(t){let e=new Int16Array(t.length);for(let n=0;n<t.length;n++){let r=Math.max(-1,Math.min(1,t[n]));e[n]=r<0?32768*r:32767*r}let n=new Uint8Array(e.buffer),r="";for(let t=0;t<n.length;t+=32768)r+=String.fromCharCode(...n.subarray(t,t+32768));return btoa(r)}(e.data))},this.context.createMediaStreamSource(this.stream).connect(this.workletNode)}enqueue(t){if(!this.context)return;let e=function(t){let e=atob(t),n=new Uint8Array(e.length);for(let t=0;t<e.length;t++)n[t]=e.charCodeAt(t);let r=new Int16Array(n.buffer,0,Math.floor(n.length/2)),s=new Float32Array(r.length);for(let t=0;t<r.length;t++)s[t]=r[t]/32768;return s}(t);if(0===e.length)return;let n=this.context.createBuffer(1,e.length,16e3);n.copyToChannel(e,0);let r=this.context.createBufferSource();r.buffer=n,r.connect(this.context.destination);let s=Math.max(this.context.currentTime,this.playhead);r.start(s),this.playhead=s+n.duration,this.playing.push(r),r.onended=()=>{this.playing=this.playing.filter(t=>t!==r)}}clear(){for(let t of this.playing)try{t.stop()}catch{}this.playing=[],this.playhead=0}setMuted(t){for(let e of this.stream?.getAudioTracks()??[])e.enabled=!t}stop(){for(let t of(this.clear(),this.workletNode?.disconnect(),this.workletNode=null,this.stream?.getTracks()??[]))t.stop();this.stream=null,this.context?.close(),this.context=null}}}}]);