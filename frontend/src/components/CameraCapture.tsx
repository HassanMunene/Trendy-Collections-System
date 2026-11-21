import { useEffect, useRef, useState } from 'react'

/** Request the user's camera and return refs + capture function.
 *  The caller must render <video ref={video} style={{ objectFit: 'cover' }} />.
 *  Call capture() to take a photo; it returns a data URL or throws.
 */
export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        setVideoStream(stream)
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (e) {
        setCameraError(
          e instanceof Error ? e.message : 'Could not access camera',
        )
      }
    })()
    return () => {
      if (videoStream?.getTracks()) videoStream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capture = (): string => {
    if (!canvasRef.current || !videoRef.current) throw new Error('Camera not ready')
    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2d context')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  return { videoRef, canvasRef, capture, cameraError, hasStream: !!videoStream }
}

/** Simple camera UI: video preview, take photo button, cancel. */
export function CameraUI({
  onPhotoTaken,
  onClose,
}: {
  onPhotoTaken: (dataURL: string) => void
  onClose: () => void
}) {
  const { videoRef, canvasRef, capture, cameraError, hasStream } = useCameraCapture()
  const [dataURL, setDataURL] = useState('')

  useEffect(() => {
    if (dataURL) onPhotoTaken(dataURL)
  }, [dataURL])

  if (cameraError) return <p className="text-danger">Camera error: {cameraError}</p>
  if (!hasStream) return null

  const handleCapture = () => {
    try {
      const url = capture()
      setDataURL(url)
    } catch {
      // user may have denied re-access; ignore
    }
  }

  return (
    <div className="camera-ui relative">
      {/* Video preview fills the parent */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        muted
      />
      <canvas ref={canvasRef} className="absolute inset-0 opacity-0"></canvas>

      {/* Overlay UI */}
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
        {dataURL ? (
          <>
            <p className="text-white text-lg font-semibold">Photo captured!</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-white text-plum rounded hover:bg-blush-200"
              aria-label="Retake photo"
            >
              Retake
            </button>
            <button
              onClick={() => onPhotoTaken(dataURL)}
              className="mt-2 px-4 py-2 bg-plum text-white rounded hover:bg-rose-300"
              aria-label="Use this photo"
            >
              Use photo
            </button>
          </>
        ) : (
          <>
            <p className="text-white text-lg font-semibold">Allow camera access to take a photo</p>
            <button
              onClick={handleCapture}
              className="mt-6 px-6 py-3 bg-plum text-white rounded text-lg font-medium hover:bg-rose-300"
              disabled={!hasStream}
              aria-label="Take photo"
            >
              Take photo
            </button>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 bg-white text-plum rounded hover:bg-blush-200"
              aria-label="Cancel"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}