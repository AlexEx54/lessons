/* The call of a group session: one LiveKit room for the teacher and the students, joined with a pass from the app.
   It sends the tracks of CallMedia, plays everyone's sound and tells the page who is in the call (peers()).
   livekit-client is loaded only on joining, so the lesson page stays light for those who never join. */
(() => {
  'use strict';

  // endpoint       GET returns { url, token }: the pass into the room of this session
  // media          CallMedia whose tracks are sent
  // onChange()     the connection, a peer or their tracks changed, see status() and peers()
  // onEnded(reason, message)  'ended' by the teacher, 'removed' by the teacher, 'elsewhere' when another tab
  //                took the call over, 'lost' when the connection dropped for good, 'refused' with the app's message
  function create({ endpoint, media, onChange, onEnded, load = () => import('/assets/livekit-client.bundle.mjs') }) {
    let lk = null;
    let room = null;
    let status = 'connecting';
    let leaving = false;
    // Publishing waits for the previous change, so tracks are never published twice.
    let queue = Promise.resolve();
    const sounds = document.createElement('div');
    sounds.hidden = true;
    document.body.append(sounds);

    async function join() {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const pass = await response.json().catch(() => ({}));
        if (!response.ok) { end('refused', pass.error || 'Звонок этого занятия недоступен.'); return; }
        lk = await load();
        if (leaving) return;
        room = new lk.Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false });
        listen();
        await room.connect(pass.url, pass.token);
        if (leaving) { void room.disconnect(); return; }
        status = 'connected';
        onChange();
        sync();
      } catch (error) {
        console.error('Group call:', error);
        end('refused', 'Не удалось подключиться к звонку. Попробуйте ещё раз.');
      }
    }

    function end(reason, message) {
      if (leaving) return;
      close();
      onEnded(reason, message);
    }

    function listen() {
      const { RoomEvent, Track, DisconnectReason } = lk;
      room.on(RoomEvent.TrackSubscribed, track => {
        if (track.kind === Track.Kind.Audio) sounds.append(track.attach());
        onChange();
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach(element => element.remove());
        onChange();
      });
      // The teacher muted this participant: CallMedia learns that the microphone or camera is off.
      room.on(RoomEvent.TrackMuted, (publication, participant) => {
        if (participant === room.localParticipant && publication.source === Track.Source.Camera && media.snapshot().camera) {
          void media.toggle('video');
        }
        onChange();
      });
      [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantNameChanged,
        RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackUnmuted, RoomEvent.ActiveSpeakersChanged,
        RoomEvent.AudioPlaybackStatusChanged].forEach(event => room.on(event, () => onChange()));
      room.on(RoomEvent.Reconnecting, () => { status = 'reconnecting'; onChange(); });
      room.on(RoomEvent.Reconnected, () => { status = 'connected'; onChange(); });
      room.on(RoomEvent.Disconnected, reason => {
        const reasons = { [DisconnectReason.ROOM_DELETED]: 'ended', [DisconnectReason.PARTICIPANT_REMOVED]: 'removed',
          [DisconnectReason.DUPLICATE_IDENTITY]: 'elsewhere' };
        end(reasons[reason] || 'lost');
      });
    }

    // Puts what CallMedia sends now into the room: the microphone always (muted when off), the camera or the screen.
    function sync() {
      queue = queue.then(async () => {
        if (status === 'connecting' || leaving) return;
        const { Source } = lk.Track;
        const sent = media.sentState();
        const video = media.outboundVideoTrack();
        await put(Source.Microphone, media.track('audio'), sent.audio);
        await put(Source.Camera, sent.screen ? null : video);
        await put(Source.ScreenShare, sent.screen ? video : null);
        await put(Source.ScreenShareAudio, sent.screen ? media.screenAudioTrack() : null);
      }).catch(error => console.error('Group call tracks:', error));
    }

    async function put(source, track, on = true) {
      const local = room.localParticipant;
      const publication = local.getTrackPublication(source);
      if (!track) {
        if (publication?.track) await local.unpublishTrack(publication.track, false);
        return;
      }
      if (!publication) {
        await local.publishTrack(track, { source, simulcast: source === lk.Track.Source.Camera });
      } else if (publication.track.mediaStreamTrack !== track) {
        await publication.track.replaceTrack(track, { userProvidedTrack: true });
      }
      const current = local.getTrackPublication(source);
      if (current.isMuted === on) await (on ? current.unmute() : current.mute());
    }

    // Everyone else in the call: the teacher first, then the students by name.
    function peers() {
      if (!room || status === 'connecting') return [];
      const { Source } = lk.Track;
      const shown = (participant, source) => {
        const publication = participant.getTrackPublication(source);
        return publication && !publication.isMuted && publication.track ? publication.track : null;
      };
      const role = participant => { try { return JSON.parse(participant.metadata).role; } catch { return null; } };
      return [...room.remoteParticipants.values()].map(participant => {
        const microphone = participant.getTrackPublication(Source.Microphone);
        const screen = shown(participant, Source.ScreenShare);
        const camera = shown(participant, Source.Camera);
        return { identity: participant.identity, name: participant.name || 'Участник', teacher: role(participant) === 'teacher',
          audio: Boolean(microphone && !microphone.isMuted), camera: Boolean(camera), screen, video: screen || camera,
          speaking: participant.isSpeaking };
      }).sort((a, b) => Number(b.teacher) - Number(a.teacher) || a.name.localeCompare(b.name, 'ru'));
    }

    function close() {
      leaving = true;
      sounds.remove();
      void room?.disconnect();
    }

    return {
      join, close, peers, sync,
      status: () => status,
      // A browser may refuse to play sound until the participant presses something on the page.
      audioBlocked: () => Boolean(room && status !== 'connecting' && !room.canPlaybackAudio),
      startAudio: () => room?.startAudio(),
    };
  }

  window.CallRoom = { create };
})();
