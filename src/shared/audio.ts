export interface MixedCapture {
  stream: MediaStream;
  context: AudioContext;
}

// Tab audio must be re-routed to the speakers: capturing a tab mutes it for the
// user otherwise. The mic is never routed to the speakers (feedback loop).
export const buildMixingGraph = async (
  tabStream: MediaStream,
  micStream: MediaStream,
): Promise<MixedCapture> => {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();

  const tabSource = context.createMediaStreamSource(tabStream);
  const tabGain = context.createGain();
  tabSource.connect(tabGain);
  tabGain.connect(destination);
  tabSource.connect(context.destination);

  const micSource = context.createMediaStreamSource(micStream);
  const micGain = context.createGain();
  micSource.connect(micGain);
  micGain.connect(destination);

  // Offscreen documents have no user gesture, so the context can start suspended.
  if (context.state === "suspended") {
    await context.resume();
  }

  return { stream: destination.stream, context };
};
