"use strict";

/* WaveMusic player: local audio + embedded YouTube + Media Session */

const audio = document.getElementById("audio");
const songTitle = document.getElementById("songTitle");
const artistName = document.getElementById("artistName");
const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");
const currentTimeDisplay = document.getElementById("currentTime");
const durationDisplay = document.getElementById("duration");
const volumeBar = document.getElementById("volumeBar");
const playlist = document.getElementById("playlist");
const localMusicInput = document.getElementById("localMusic");
const statusMessage = document.getElementById("statusMessage");
const onlineTrackList = document.getElementById("onlineTracks");
const musicSearch = document.getElementById("musicSearch");
const searchMessage = document.getElementById("searchMessage");
const categoryButtons = document.querySelectorAll(".category-btn");
const notificationToggle = document.getElementById("notificationToggle");
const videoContainer = document.getElementById("videoContainer");

let localSongs = [];
let currentSong = null;
let currentSongIndex = -1;
let playbackType = "none";
let selectedCategory = "all";
let searchQuery = "";
let youtubePlayer = null;
let youtubeReady = false;
let pendingVideoId = null;
let youtubeApiLoading = false;

const musicCatalogue = [
    {
        title: "Unstoppable",
        artist: "Sia",
        category: "all",
        videoId: "0GEODMHnQDs"
    },
    {
        title: "Way Maker",
        artist: "Sinach",
        category: "worship",
        videoId: "QM8jQHE5AAk"
    },
    {
        title: "Excess Love",
        artist: "Mercy Chinwo",
        category: "worship",
        videoId: "awexlghI7gM"
    },
    {
        title: "Nara",
        artist: "Tim Godfrey ft. Travis Greene",
        category: "praise",
        videoId: "bhZKHBIPYPA"
    },
    {
        title: "Omemma",
        artist: "Maverick City Music",
        category: "worship",
        videoId: "LHrwLbf9shI"
    },
    {
        title: "No Turning Back II",
        artist: "Gaise Baba ft. Lawrence Oyor",
        category: "praise",
        videoId: "dkPClcO4Whw"
    }
];

/* Format song duration */

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    return `${Math.floor(seconds / 60)}:${String(
        Math.floor(seconds % 60)
    ).padStart(2, "0")}`;
}

/* Display status messages */

function showStatus(message) {
    statusMessage.textContent = message || "";
}

/* Update play/pause button */

function updatePlayButton(isPlaying) {
    playBtn.textContent = isPlaying ? "❚❚" : "▶";
    playBtn.setAttribute(
        "aria-label",
        isPlaying ? "Pause" : "Play"
    );
}

/* Android media notifications */

function notificationsEnabled() {
    return !notificationToggle || notificationToggle.checked;
}

function setMediaMetadata(title, artist) {
    if (
        !("mediaSession" in navigator) ||
        !("MediaMetadata" in window)
    ) {
        return;
    }

    if (!notificationsEnabled()) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "WaveMusic",
        artist: artist || "Unknown Artist",
        album: "WaveMusic"
    });
}

function setMediaState(state) {
    if (!("mediaSession" in navigator)) {
        return;
    }

    navigator.mediaSession.playbackState =
        notificationsEnabled() ? state : "none";
}

function setupMediaSession() {
    if (!("mediaSession" in navigator)) {
        return;
    }

    const handlers = {
        play: () => playCurrentSong(),

        pause: () => pauseCurrentSong(),

        nexttrack: () => playNextSong(),

        previoustrack: () => playPreviousSong(),

        seekbackward: details => {
            if (
                playbackType === "local" &&
                Number.isFinite(audio.duration)
            ) {
                audio.currentTime = Math.max(
                    0,
                    audio.currentTime - (details.seekOffset || 10)
                );
            }
        },

        seekforward: details => {
            if (
                playbackType === "local" &&
                Number.isFinite(audio.duration)
            ) {
                audio.currentTime = Math.min(
                    audio.duration,
                    audio.currentTime + (details.seekOffset || 10)
                );
            }
        }
    };

    Object.entries(handlers).forEach(([action, handler]) => {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (_) {
            // The browser may not support this action.
        }
    });
}

setupMediaSession();

/* Notification toggle */

if (notificationToggle) {
    notificationToggle.addEventListener("change", () => {
        if (!notificationToggle.checked) {
            if ("mediaSession" in navigator) {
                navigator.mediaSession.metadata = null;
                navigator.mediaSession.playbackState = "none";
            }

            return;
        }

        if (currentSong) {
            setMediaMetadata(
                currentSong.title,
                currentSong.artist
            );

            const isPlaying =
                playbackType === "local"
                    ? !audio.paused
                    : playbackType === "youtube" &&
                      youtubePlayer &&
                      youtubeReady
                        ? youtubePlayer.getPlayerState() ===
                          YT.PlayerState.PLAYING
                        : false;

            setMediaState(isPlaying ? "playing" : "paused");
        }
    });
}

/* Render online music catalogue */

function renderOnlineTracks() {
    onlineTrackList.innerHTML = "";

    musicCatalogue.forEach((track, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "online-track";
        button.dataset.index = String(index);
        button.dataset.title = track.title;
        button.dataset.artist = track.artist;
        button.dataset.category = track.category;

        const icon = document.createElement("span");
        icon.className = "online-icon";
        icon.textContent = "♫";

        const details = document.createElement("span");
        details.className = "online-details";

        const title = document.createElement("strong");
        title.textContent = track.title;

        const artist = document.createElement("small");
        artist.textContent = track.artist;

        details.append(title, artist);

        const arrow = document.createElement("span");
        arrow.className = "online-arrow";
        arrow.textContent = "›";

        button.append(icon, details, arrow);

        button.addEventListener("click", () => {
            playOnlineSong(index);
        });

        onlineTrackList.appendChild(button);
    });

    filterOnlineTracks();
}

/* Search and category filtering */

function filterOnlineTracks() {
    let visibleCount = 0;

    document.querySelectorAll(".online-track").forEach(button => {
        const title = (
            button.dataset.title || ""
        ).toLowerCase();

        const artist = (
            button.dataset.artist || ""
        ).toLowerCase();

        const category = button.dataset.category;

        const matchesSearch =
            title.includes(searchQuery) ||
            artist.includes(searchQuery);

        const matchesCategory =
            selectedCategory === "all" ||
            category === selectedCategory;

        const visible = matchesSearch && matchesCategory;

        button.hidden = !visible;

        if (visible) {
            visibleCount++;
        }
    });

    searchMessage.textContent = visibleCount
        ? `${visibleCount} song${visibleCount === 1 ? "" : "s"} found.`
        : "No songs in this category yet. Try All Music or another category.";
}

musicSearch.addEventListener("input", () => {
    searchQuery = musicSearch.value.trim().toLowerCase();
    filterOnlineTracks();
});

categoryButtons.forEach(button => {
    button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;

        categoryButtons.forEach(item => {
            item.classList.toggle("active", item === button);
        });

        filterOnlineTracks();
    });
});

/* Load YouTube IFrame API */

window.onYouTubeIframeAPIReady = function () {
    youtubeReady = true;
    youtubeApiLoading = false;

    if (pendingVideoId) {
        createYouTubePlayer(pendingVideoId);
    }
};

function loadYouTubeAPI() {
    if (
        youtubeReady &&
        window.YT &&
        window.YT.Player
    ) {
        return;
    }

    if (youtubeApiLoading) {
        return;
    }

    youtubeApiLoading = true;

    const existing = document.getElementById(
        "youtube-iframe-api"
    );

    if (existing) {
        return;
    }

    const script = document.createElement("script");

    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";

    script.onerror = () => {
        youtubeApiLoading = false;

        showStatus(
            "Could not load YouTube. Check your internet connection."
        );
    };

    document.head.appendChild(script);
}

/* Create YouTube player */

function loadYouTubePlayer(videoId) {
    pendingVideoId = videoId;

    if (
        youtubeReady &&
        window.YT &&
        window.YT.Player
    ) {
        createYouTubePlayer(videoId);
        return;
    }

    videoContainer.innerHTML = "";

    const placeholder = document.createElement("div");
    placeholder.className = "video-placeholder";

    placeholder.innerHTML =
        "<span>♫</span><p>Loading YouTube player…</p>";

    videoContainer.appendChild(placeholder);

    loadYouTubeAPI();
}

function createYouTubePlayer(videoId) {
    videoContainer.innerHTML = "";

    const playerElement = document.createElement("div");
    playerElement.id = "youtubePlayer";

    videoContainer.appendChild(playerElement);

    youtubePlayer = new YT.Player("youtubePlayer", {
        width: "100%",
        height: "100%",
        videoId: videoId,

        playerVars: {
            playsinline: 1,
            rel: 0,
            enablejsapi: 1
        },

        events: {
            onReady: () => {
                // Playback begins after the user's action.
            },

            onStateChange: event => {
                if (event.data === YT.PlayerState.PLAYING) {
                    updatePlayButton(true);

                    setMediaMetadata(
                        currentSong?.title,
                        currentSong?.artist
                    );

                    setMediaState("playing");

                } else if (
                    event.data === YT.PlayerState.PAUSED
                ) {
                    updatePlayButton(false);
                    setMediaState("paused");

                } else if (
                    event.data === YT.PlayerState.ENDED
                ) {
                    updatePlayButton(false);
                    setMediaState("paused");
                    playNextSong();
                }
            },

            onError: () => {
                showStatus(
                    "This YouTube video could not be embedded. Try another track."
                );

                updatePlayButton(false);
                setMediaState("paused");
            }
        }
    });
}

/* Play an online song */

function playOnlineSong(index) {
    const track = musicCatalogue[index];

    if (!track) {
        return;
    }

    if (playbackType === "local") {
        audio.pause();
    }

    playbackType = "youtube";
    currentSong = track;
    currentSongIndex = index;

    songTitle.textContent = track.title;
    artistName.textContent = `${track.artist} · YouTube`;

    progressBar.value = 0;
    currentTimeDisplay.textContent = "0:00";
    durationDisplay.textContent = "0:00";

    updatePlayButton(false);

    document.querySelectorAll(".online-track").forEach(button => {
        const active = Number(button.dataset.index) === index;

        button.classList.toggle("active", active);

        const icon = button.querySelector(".online-icon");

        if (icon) {
            icon.textContent = active ? "▶" : "♫";
        }
    });

    renderPlaylist();

    setMediaMetadata(track.title, track.artist);
    setMediaState("paused");

    showStatus("");

    loadYouTubePlayer(track.videoId);
}

/* Local music playlist */

function renderPlaylist() {
    playlist.innerHTML = "";

    localSongs.forEach((song, index) => {
        const item = document.createElement("li");

        if (
            playbackType === "local" &&
            currentSong === song
        ) {
            item.classList.add("active");
        }

        const info = document.createElement("div");
        info.className = "playlist-song-info";

        const title = document.createElement("span");
        title.className = "playlist-song-title";
        title.textContent = song.title;

        const artist = document.createElement("span");
        artist.className = "playlist-song-artist";
        artist.textContent = song.artist;

        const icon = document.createElement("span");
        icon.className = "playlist-play-icon";

        icon.textContent =
            playbackType === "local" &&
            currentSong === song &&
            !audio.paused
                ? "❚❚"
                : "♫";

        info.append(title, artist);
        item.append(info, icon);

        item.addEventListener("click", () => {
            playLocalSong(index);
        });

        playlist.appendChild(item);
    });
}

/* Play a local audio file */

function playLocalSong(index) {
    const song = localSongs[index];

    if (!song) {
        return;
    }

    if (
        playbackType === "youtube" &&
        youtubePlayer &&
        youtubeReady
    ) {
        try {
            youtubePlayer.stopVideo();
        } catch (_) {}
    }

    playbackType = "local";
    currentSong = song;
    currentSongIndex = index;

    audio.src = song.src;

    songTitle.textContent = song.title;
    artistName.textContent = song.artist;

    progressBar.value = 0;
    currentTimeDisplay.textContent = "0:00";
    durationDisplay.textContent = "0:00";

    document.querySelectorAll(".online-track").forEach(button => {
        button.classList.remove("active");

        const icon = button.querySelector(".online-icon");

        if (icon) {
            icon.textContent = "♫";
        }
    });

    setMediaMetadata(song.title, song.artist);

    renderPlaylist();
    playCurrentSong();
}

/* Add local music files */

localMusicInput.addEventListener("change", event => {
    const files = Array.from(event.target.files || []);
    let added = 0;

    files.forEach(file => {
        const supported =
            file.type.startsWith("audio/") ||
            /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name);

        if (!supported) {
            return;
        }

        localSongs.push({
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "Local Music",
            src: URL.createObjectURL(file)
        });

        added++;
    });

    renderPlaylist();

    showStatus(
        added
            ? `${added} song${added === 1 ? "" : "s"} added successfully.`
            : "No supported audio files were selected."
    );

    event.target.value = "";
});

/* Play current song */

function playCurrentSong() {
    if (playbackType === "youtube") {
        if (youtubePlayer && youtubeReady) {
            try {
                youtubePlayer.playVideo();
            } catch (_) {}
        }

        return;
    }

    if (playbackType !== "local" || !audio.src) {
        showStatus(
            "Add a local audio file or select an online song first."
        );

        return;
    }

    audio.play()
        .then(() => {
            updatePlayButton(true);

            setMediaMetadata(
                currentSong.title,
                currentSong.artist
            );

            setMediaState("playing");

            renderPlaylist();
            showStatus("");
        })
        .catch(() => {
            updatePlayButton(false);

            showStatus(
                "Playback was blocked or the audio file could not be played. Tap Play again."
            );
        });
}

/* Pause current song */

function pauseCurrentSong() {
    if (playbackType === "youtube") {
        if (youtubePlayer && youtubeReady) {
            try {
                youtubePlayer.pauseVideo();
            } catch (_) {}
        }

        updatePlayButton(false);
        setMediaState("paused");

        return;
    }

    audio.pause();

    updatePlayButton(false);
    setMediaState("paused");

    renderPlaylist();
}

/* Main play/pause button */

playBtn.addEventListener("click", () => {
    if (playbackType === "youtube") {
        if (youtubePlayer && youtubeReady) {
            const state = youtubePlayer.getPlayerState();

            if (state === YT.PlayerState.PLAYING) {
                pauseCurrentSong();
            } else {
                playCurrentSong();
            }
        } else {
            showStatus(
                "Wait for the YouTube player to load, then try again."
            );
        }

        return;
    }

    if (audio.paused) {
        playCurrentSong();
    } else {
        pauseCurrentSong();
    }
});

/* Next song */

function playNextSong() {
    if (playbackType === "youtube") {
        if (!musicCatalogue.length) {
            return;
        }

        playOnlineSong(
            (currentSongIndex + 1) % musicCatalogue.length
        );

        return;
    }

    if (!localSongs.length) {
        return;
    }

    const index = localSongs.indexOf(currentSong);

    playLocalSong(
        index < 0 ? 0 : (index + 1) % localSongs.length
    );
}

/* Previous song */

function playPreviousSong() {
    if (playbackType === "youtube") {
        if (!musicCatalogue.length) {
            return;
        }

        playOnlineSong(
            (currentSongIndex - 1 + musicCatalogue.length) %
            musicCatalogue.length
        );

        return;
    }

    if (!localSongs.length) {
        return;
    }

    const index = localSongs.indexOf(currentSong);

    playLocalSong(
        index < 0 ? 0 : (index - 1 + localSongs.length) %
        localSongs.length
    );
}

nextBtn.addEventListener("click", playNextSong);
prevBtn.addEventListener("click", playPreviousSong);

/* Audio progress and duration */

audio.addEventListener("loadedmetadata", () => {
    if (playbackType === "local") {
        durationDisplay.textContent = formatTime(audio.duration);
    }
});

audio.addEventListener("timeupdate", () => {
    if (playbackType !== "local") {
        return;
    }

    if (
        Number.isFinite(audio.duration) &&
        audio.duration > 0
    ) {
        progressBar.value = String(
            (audio.currentTime / audio.duration) * 100
        );
    }

    currentTimeDisplay.textContent = formatTime(audio.currentTime);
});

progressBar.addEventListener("input", () => {
    if (
        playbackType === "local" &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0
    ) {
        audio.currentTime =
            (Number(progressBar.value) / 100) * audio.duration;
    }
});

/* Update media controls when audio plays or pauses */

audio.addEventListener("play", () => {
    if (playbackType === "local") {
        updatePlayButton(true);

        setMediaMetadata(
            currentSong?.title,
            currentSong?.artist
        );

        setMediaState("playing");
    }
});

audio.addEventListener("pause", () => {
    if (playbackType === "local") {
        updatePlayButton(false);
        setMediaState("paused");
    }
});

audio.addEventListener("ended", () => {
    if (playbackType === "local") {
        playNextSong();
    }
});

audio.addEventListener("error", () => {
    if (playbackType === "local") {
        updatePlayButton(false);
        showStatus("Audio could not be loaded.");
    }
});

/* Volume control: slider range is 0–1 */

audio.volume = 1;
volumeBar.value = "1";

volumeBar.addEventListener("input", () => {
    audio.volume = Math.min(
        1,
        Math.max(0, Number(volumeBar.value))
    );
});

/* Initial setup */

renderOnlineTracks();
renderPlaylist();
