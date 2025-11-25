# Linux Setup Guide for Eventide FFXI Launcher

This guide will help you set up and run the Eventide FFXI Launcher on Linux.

## Prerequisites

- Linux distribution (Ubuntu 20.04+, Fedora 35+, Arch, or similar)
- Wine 8.0+ or Proton (for running Windows FFXI client)
- Winetricks (recommended for managing Wine prefixes)

## Installation

### Option 1: AppImage (Recommended)

1. Download the AppImage from the releases page
2. Make it executable:
   bash
   chmod +x Eventide-FFXI-Launcher-*.AppImage

3. Run it:
   bash
   ./Eventide-FFXI-Launcher-*.AppImage


### Option 2: Debian/Ubuntu (.deb)

bash
sudo dpkg -i eventide-ffxi-launcher_*.deb
sudo apt-get install -f
