import { useCallback, useEffect, useRef, useState } from 'react';
import { en } from '../i18n/en';

const MAX_DURATION_MS = 30_000;
const TICK_MS = 250;

export type RecorderStatus = 'ready' | 'requesting' | 'recording' | 'paused' | 'preview' | 'error';

interface AudioRecorderState {
  status: RecorderStatus;
  durationMs: number;
  audioUrl: string | null;
  audioBlob: Blob | null;
  mimeType: string | null;
  errorMessage: string | null;
}

const MIME_PREFERENCES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function chooseMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_PREFERENCES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    status: 'ready', durationMs: 0, audioUrl: null, audioBlob: null, mimeType: null, errorMessage: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const discardedRef = useRef(false);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState((current) => ({ ...current, status: 'error', errorMessage: en.errorUnsupported }));
      return;
    }

    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    chunksRef.current = [];
    discardedRef.current = false;
    setState({ status: 'requesting', durationMs: 0, audioUrl: null, audioBlob: null, mimeType: null, errorMessage: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = chooseMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        releaseStream();
        if (discardedRef.current) return;
        const actualMimeType = recorder.mimeType || mimeType || 'application/octet-stream';
        const audioBlob = new Blob(chunksRef.current, { type: actualMimeType });
        if (audioBlob.size === 0) {
          setState((current) => ({ ...current, status: 'error', errorMessage: en.errorNoAudio }));
          return;
        }
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;
        setState((current) => ({ ...current, status: 'preview', audioUrl, audioBlob, mimeType: actualMimeType, errorMessage: null }));
      };
      recorder.onerror = () => {
        releaseStream();
        setState((current) => ({ ...current, status: 'error', errorMessage: en.errorUnexpected }));
      };
      recorder.start(250);
      setState({ status: 'recording', durationMs: 0, audioUrl: null, audioBlob: null, mimeType: recorder.mimeType || mimeType || null, errorMessage: null });
    } catch (error) {
      releaseStream();
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      setState((current) => ({
        ...current,
        status: 'error',
        errorMessage: denied
          ? en.errorDenied
          : en.errorMicrophone,
      }));
    }
  }, [releaseStream]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setState((current) => ({ ...current, status: 'paused' }));
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setState((current) => ({ ...current, status: 'recording' }));
    }
  }, []);

  const discardRecording = useCallback(() => {
    discardedRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    releaseStream();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setState({ status: 'ready', durationMs: 0, audioUrl: null, audioBlob: null, mimeType: null, errorMessage: null });
  }, [releaseStream]);

  useEffect(() => {
    if (state.status !== 'recording') return undefined;
    const timer = window.setInterval(() => {
      setState((current) => {
        const durationMs = Math.min(current.durationMs + TICK_MS, MAX_DURATION_MS);
        if (durationMs >= MAX_DURATION_MS) window.setTimeout(() => recorderRef.current?.stop(), 0);
        return { ...current, durationMs };
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.status]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    releaseStream();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, [releaseStream]);

  return { ...state, startRecording, stopRecording, pauseRecording, resumeRecording, discardRecording };
}
