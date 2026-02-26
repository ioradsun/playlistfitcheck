export function getAudioStoragePath(userId: string, projectId: string, fileName: string) {
  const ext = fileName.split(".").pop() || "mp3";
  return `lyric-dance/${userId}/${projectId}.${ext}`;
}

