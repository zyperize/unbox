# Unbox - File Manager & 7-Zip Archive Tool

A modern desktop file manager and archive tool built with Rust and React, featuring 7-Zip compression/decompression functionality with a clean, intuitive UI.

## Features

### File Management
- **Tab System**: Open multiple folders in separate tabs for easy navigation
- **Quick Access Sidebar**: Pinned shortcuts to common directories (Home, Desktop, Documents, Downloads, Pictures, Music, Videos)
- **File Browsing**: Navigate through your file system with an intuitive table interface
- **Search**: Quick search functionality to find files within the current directory
- **File Operations**: Copy, paste, delete, and create new folders

### Archive Support
- **7-Zip Compression**: Create 7z archives from files and folders
- **7-Zip Extraction**: Extract 7z archives to any location
- Based on the official 7-Zip implementation (https://github.com/mcmilk/7-Zip.git)

### UI Design
- Clean, modern interface inspired by the UNBOX template design
- Warm color palette with #F3EDDF background and #D97A2B accents
- **Thicker table borders** for better visual separation in the file list
- Space Grotesk font for modern typography
- Responsive design that adapts to different window sizes

## Technology Stack

### Backend (Rust)
- **Tauri 2.0**: Modern desktop application framework
- **sevenz-rust**: Native 7-Zip compression/decompression
- **dirs**: Cross-platform directory access
- **walkdir**: Efficient file system traversal for search
- **chrono**: Date/time formatting

### Frontend (React + TypeScript)
- **React 18**: Modern UI library
- **TypeScript**: Type-safe frontend development
- **Vite**: Fast build tool and dev server

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- [Rust](https://www.rust-lang.org/) (latest stable)

### Installation

1. Navigate to the project directory:
```bash
cd UNBOX/unbox-7zip
```

2. Install dependencies:
```bash
npm install
```

### Development

Run the development server:
```bash
npm run tauri dev
```

This will start the Vite dev server and launch the Tauri app in development mode with hot reloading.

### Building for Production

Build the application for your platform:
```bash
npm run tauri build
```

The built application will be in `src-tauri/target/release`.

## Project Structure

```
unbox-7zip/
├── src/                    # React frontend source
│   ├── App.tsx            # Main application component
│   ├── App.css            # Application styles
│   └── main.tsx           # React entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   └── lib.rs         # Main Rust application code
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
└── package.json           # Node.js dependencies
```

## Features in Detail

### Tab Management
- Create new tabs with the "+" button
- Switch between tabs by clicking on them
- Close tabs individually (minimum one tab required)
- Each tab maintains its own directory path and navigation history

### File Navigation
- Click on folders to navigate into them
- Directory tree shows Name, Size, and Last Modified columns
- Folders appear first, followed by files, all alphabetically sorted
- Visual folder icons distinguish directories from files

### Search Functionality
- Enter search query in the top search bar
- Press Enter to search within the current directory
- Search traverses up to 5 levels deep
- Clear button (X) to reset search and return to directory view

### Archive Operations
1. **Extract Archive**:
   - Select a 7z file by checking its checkbox
   - Click the "Extract" button
   - Archive will be extracted to the current directory

2. **Create Archive** (via Rust backend):
   - Use the `create_archive` function
   - Provide source path and destination archive path

## Color Scheme

The application uses a warm, professional color palette:
- Background: `#F3EDDF` (warm beige)
- Primary accent: `#D97A2B` (warm orange)
- Secondary text: `#6C5F4E` (muted olive)
- Primary text: `#2B2A28` (espresso)
- Borders: `#E9E1CF` (soft surface)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

This project incorporates 7-Zip compression technology. The 7-Zip reference repository is included in the `UNBOX/7zip-reference` directory for reference purposes.

## Development Notes

- The application uses Tauri's security model with explicit file system permissions
- File operations are sandboxed to the user's home directory for security
- The React frontend communicates with the Rust backend via Tauri's IPC system
- All file paths are handled securely through Tauri's file system API
- On Windows the backend requests the `SeBackupPrivilege` right at startup so MFT scans work out of the box. If the privilege is not granted to the user account, the app falls back gracefully and prints a warning instructing how to enable the local security policy.
