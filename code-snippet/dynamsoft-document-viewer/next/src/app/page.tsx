"use client";
import dynamic from 'next/dynamic'


const ViewerComponent = dynamic(
  () => import("./components/Viewer"),
  {
    ssr: false
  }
)

export default function Home() {
  return (
    <>
      <h1>Hello World for Next</h1>
      <ViewerComponent/>
    </>
  )
}
