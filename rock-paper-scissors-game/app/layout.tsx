import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'Rock Paper Scissors - Multiplayer',
    description: 'Real-time multiplayer rock paper scissors game',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
