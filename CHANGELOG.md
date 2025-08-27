# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Template MVP feature for professional PDF document generation
- Multi-page PDF template editor with drag-and-drop interface
- Support for multiple paper sizes (A0-A5) and orientations
- Real-time vector and raster preview modes
- File upload support for images (JPG, PNG, SVG) and drawings (DXF, PDF)
- Auto-alignment guides and snap-to-grid functionality
- Thumbnail generation for template preview (400x300px)
- Template versioning and history management
- 8-direction resize handles for precise view manipulation
- Rotation controls for view elements
- Multi-language support in template editor

### Fixed
- PDF Template Preview canvas duplication bug in portrait mode
- Canvas initialization logic improvements
- CSS enhancements for preventing duplicate canvas display
- WebGL memory management for 3D view rendering

### Changed
- Enhanced PDF generation with vector data support
- Improved material factory with caching for better performance
- Optimized view rendering system for template editor
- Updated space calculation and furniture positioning logic

### Technical Details
- Implemented comprehensive state management for template data
- Added ViewPosition interface for precise element tracking
- Created PaperDimensions calculation system following ISO 216 standards
- Integrated html2canvas and jsPDF for PDF generation
- Added svg2pdf.js for vector graphics support

## [0.9.0] - 2025-01-27

### Added
- DXF export functionality with automated Git integration
- Konva and React Konva packages for 2D canvas editor
- Tenant version assets management system
- Firebase integration for design snapshots
- Team-based project management

### Fixed
- Various canvas rendering issues
- Memory leaks in 3D viewer
- Material caching problems

### Changed
- Improved build configuration with chunk splitting
- Enhanced TypeScript configuration for stricter type checking
- Optimized bundle size with manual chunk configuration

## [0.8.0] - 2025-01-20

### Added
- Initial 3D furniture editor implementation
- React Three Fiber integration
- Zustand state management
- Firebase authentication and storage
- Material and texture system

### Changed
- Project structure reorganization
- Centralized control components
- Provider pattern implementation

### Fixed
- Initial bug fixes and performance improvements

---

## Release Notes for Template MVP (v0.9.1)

### 🎯 Overview
The Template MVP introduces a powerful PDF template system that enables users to create professional furniture design documentation. This feature significantly enhances the design-to-production workflow by providing customizable, multi-page PDF generation capabilities.

### ✨ Key Features

#### PDF Template Editor
- **Intuitive Drag-and-Drop Interface**: Easily arrange multiple views on paper
- **Multi-View Support**: TOP, Front, Side, Door, Right, Base, ISO views and custom details
- **Real-time Preview**: Toggle between vector and raster modes for optimal viewing
- **Multi-Page Documents**: Create comprehensive documentation across multiple pages

#### Paper Configuration
- **Standard Sizes**: Full support for A0, A1, A2, A3, A4, A5 paper sizes
- **Flexible Orientation**: Both landscape and portrait modes
- **ISO 216 Compliance**: Accurate dimensions following international standards

#### Advanced Editing Capabilities
- **Precision Controls**: 8-direction resize handles for exact sizing
- **Free Rotation**: 360-degree rotation for any view element
- **Smart Guides**: Automatic alignment and snap-to-grid functionality
- **Layer Management**: Control view hierarchy and overlapping

#### File Integration
- **Multiple Formats**: Support for JPG, PNG, SVG images and DXF, PDF drawings
- **Automatic Thumbnails**: 400x300px preview generation for quick identification
- **Batch Processing**: Handle multiple files efficiently

### 🔒 Security & Permissions
- **Role-Based Access**: Creator, team member, and viewer permissions
- **Version Control**: Automatic versioning with history tracking
- **Data Integrity**: Secure Firebase storage with backup capabilities

### ⚡ Performance Specifications
- **Maximum Pages**: 10 pages per document
- **Views per Page**: Up to 20 views
- **File Size Limit**: 10MB per uploaded file
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest versions)

### 🛠️ Technical Implementation
- **State Management**: Comprehensive ViewPosition tracking system
- **Rendering Engine**: Dual vector/raster rendering modes
- **PDF Generation**: jsPDF with svg2pdf.js for high-quality output
- **Memory Optimization**: Efficient WebGL context management

### 📊 Use Cases
1. **Design Documentation**: Create complete furniture specification sheets
2. **Manufacturing Guides**: Generate production-ready technical drawings
3. **Client Presentations**: Professional PDF portfolios with multiple views
4. **Quality Control**: Standardized documentation templates

### 🔄 Migration Path
Existing projects can easily adopt templates through:
1. Opening the PDF Template editor
2. Selecting from saved templates
3. Applying and customizing as needed
4. Version history ensures safe rollback if required

### 🚀 Performance Impact
- **Generation Time**: 2-5 seconds for typical documents
- **Memory Usage**: ~100MB for complex multi-page documents
- **Storage**: ~500KB per template configuration

### 📝 Known Limitations
- Complex 3D views may require additional processing time
- Vector mode provides higher quality but slower generation
- Maximum 10 pages to ensure optimal performance

### 🔮 Future Roadmap
**Short Term (1-2 months)**
- Template sharing between teams
- Custom paper sizes
- Auto-layout suggestions

**Medium Term (3-6 months)**
- AI-powered layout optimization
- Real-time collaboration
- Template marketplace

**Long Term (6+ months)**
- Direct CAD file editing
- 3D PDF export
- AR/VR viewer integration

### 📞 Support
For assistance or feedback regarding the Template MVP:
- Documentation: `/docs/features/template-mvp-guide.md`
- Technical Support: Via project issues
- Feature Requests: Through project discussions

---

*This release represents a significant milestone in our mission to streamline furniture design workflows. The Template MVP provides the foundation for professional documentation generation while maintaining the flexibility designers need.*