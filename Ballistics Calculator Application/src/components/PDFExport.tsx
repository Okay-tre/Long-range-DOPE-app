import React, { useState } from 'react';
import { Button } from './ui/button';
import { FileDown, Printer } from 'lucide-react';
import type { Entry, Session } from '../lib/appState';

// Dynamic imports for jsPDF to handle browser compatibility
let jsPDF: any = null;
let autoTableLoaded = false;

interface PDFExportProps {
  entries: Entry[];
  session: Session;
  className?: string;
}

export function PDFExport({ entries, session, className }: PDFExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  
  // Get scope units from entries (use most common)
  const getScopeUnits = (entries: Entry[]): string => {
    if (entries.length === 0) return 'MIL';
    // Use the first entry's scope units or default to MIL
    return entries[0].scopeUnits || 'MIL';
  };

  // Calculate average weather conditions from entries
  const getAverageWeather = (entries: Entry[]) => {
    if (entries.length === 0) return null;
    
    const avgTemp = (entries.reduce((sum, e) => sum + e.temperature, 0) / entries.length).toFixed(1);
    const avgHumidity = (entries.reduce((sum, e) => sum + e.humidity, 0) / entries.length).toFixed(0);
    const avgWindSpeed = (entries.reduce((sum, e) => sum + e.windSpeed, 0) / entries.length).toFixed(1);
    const avgWindDirection = (entries.reduce((sum, e) => sum + e.windDirection, 0) / entries.length).toFixed(0);
    
    return {
      avgTemp,
      avgHumidity,
      avgWindSpeed,
      avgWindDirection
    };
  };

  // Get equipment summary from entries
  const getEquipmentSummary = (entries: Entry[]) => {
    if (entries.length === 0) return null;
    
    const firstEntry = entries[0];
    const avgV0 = (entries.reduce((sum, e) => sum + e.V0, 0) / entries.length).toFixed(0);
    const avgBC = (entries.reduce((sum, e) => sum + (e.bcUsed || 0), 0) / entries.length).toFixed(3);
    
    return {
      firearmName: firstEntry.firearmName || 'Unknown Rifle',
      ammoName: firstEntry.ammoName || 'Unknown Ammunition',
      bulletWeightGr: firstEntry.bulletWeightGr || 0,
      avgV0,
      avgBC,
      model: firstEntry.model || 'Unknown',
      barrelLengthIn: firstEntry.barrelLengthIn || 0,
      twistRateIn: firstEntry.twistRateIn || 0,
      y0Cm: firstEntry.y0Cm || 0,
      zeroDistanceM: firstEntry.zeroDistanceM || 100
    };
  };

  // Fallback print method for PDF generation
  const printToPDF = () => {
    if (entries.length === 0) {
      return;
    }

    const scopeUnits = getScopeUnits(entries);
    
    // Create a new window with printable content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export PDF');
      return;
    }

    // Generate HTML content for printing
    const htmlContent = generatePrintableHTML(entries, session, scopeUnits);
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.addEventListener('load', () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    });
  };

  const exportToPDF = async () => {
    if (entries.length === 0) {
      return;
    }

    const scopeUnits = getScopeUnits(entries);
    setIsExporting(true);

    try {
      // Try dynamic import for jsPDF
      if (!jsPDF || !autoTableLoaded) {
        const jsPDFModule = await import('jspdf');
        jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
        
        // Import autoTable plugin and ensure it's loaded
        const autoTableModule = await import('jspdf-autotable');
        
        // The plugin should automatically extend jsPDF when imported
        // But let's verify it worked
        const testDoc = new jsPDF();
        if (typeof testDoc.autoTable !== 'function') {
          throw new Error('autoTable plugin not properly loaded');
        }
        
        autoTableLoaded = true;
      }

      const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Header styling
    doc.setFillColor(148, 0, 0); // #940000
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('LONG RANGE DOPE CALCULATOR', 15, 16);
    
    // Session info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const sessionText = session.place ? `${session.title} @ ${session.place}` : session.title;
    doc.text(sessionText, pageWidth - 15, 12, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 20, { align: 'right' });
    
    // Reset text color for content
    doc.setTextColor(0, 0, 0);
    
    // Get equipment and weather summaries
    const equipment = getEquipmentSummary(entries);
    const weather = getAverageWeather(entries);
    
    // Session Summary
    let yPosition = 35;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Session Summary', 15, yPosition);
    
    yPosition += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const stats = [
      `Total Entries: ${entries.length}`,
      `Range: ${Math.min(...entries.map(e => e.rangeM))}-${Math.max(...entries.map(e => e.rangeM))}m`,
      `Session Started: ${new Date(session.startedAt).toLocaleString()}`,
      `Scope Units: ${scopeUnits}`,
    ];
    
    // Average group size if available
    const validGroups = entries.filter(e => e.groupSizeCm);
    if (validGroups.length > 0) {
      const avgGroup = (validGroups.reduce((sum, e) => sum + e.groupSizeCm!, 0) / validGroups.length).toFixed(1);
      stats.push(`Average Group Size: ${avgGroup}cm`);
    }
    
    // Total shots if available
    const totalShots = entries.filter(e => e.shots).reduce((sum, e) => sum + e.shots!, 0);
    if (totalShots > 0) {
      stats.push(`Total Shots: ${totalShots}`);
    }
    
    stats.forEach((stat, index) => {
      const xPos = 15 + (index % 3) * 90;
      const yPos = yPosition + Math.floor(index / 3) * 6;
      doc.text(stat, xPos, yPos);
    });
    
    yPosition += Math.ceil(stats.length / 3) * 6 + 10;
    
    // Equipment Information
    if (equipment) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Equipment Information', 15, yPosition);
      yPosition += 6;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Equipment details in a more organized layout
      const equipmentDetails = [
        `Firearm: ${equipment.firearmName}`,
        `Ammunition: ${equipment.ammoName}`,
        `Bullet Weight: ${equipment.bulletWeightGr}gr`,
        `Average Velocity: ${equipment.avgV0}m/s`,
        `Average BC: ${equipment.avgBC} (${equipment.model})`,
        `Barrel: ${equipment.barrelLengthIn}" (${(equipment.barrelLengthIn * 2.54).toFixed(1)}cm)`,
        `Twist Rate: 1:${equipment.twistRateIn}"`,
        `Height Over Bore: ${equipment.y0Cm}cm`,
        `Zero Distance: ${equipment.zeroDistanceM}m`
      ];
      
      equipmentDetails.forEach((detail, index) => {
        const xPos = 15 + (index % 3) * 90;
        const yPos = yPosition + Math.floor(index / 3) * 4;
        doc.text(detail, xPos, yPos);
      });
      
      yPosition += Math.ceil(equipmentDetails.length / 3) * 4 + 8;
    }
    
    // Weather Conditions Summary
    if (weather) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Average Weather Conditions', 15, yPosition);
      yPosition += 6;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const weatherDetails = [
        `Temperature: ${weather.avgTemp}°C`,
        `Humidity: ${weather.avgHumidity}%`,
        `Wind Speed: ${weather.avgWindSpeed}m/s`,
        `Wind Direction: ${weather.avgWindDirection}°`
      ];
      
      weatherDetails.forEach((detail, index) => {
        const xPos = 15 + (index % 2) * 120;
        const yPos = yPosition + Math.floor(index / 2) * 4;
        doc.text(detail, xPos, yPos);
      });
      
      yPosition += Math.ceil(weatherDetails.length / 2) * 4 + 10;
    }
    
    // Group entries by session for PDF
    const sessionGroups = new Map<string, Entry[]>();
    entries.forEach(entry => {
      if (!sessionGroups.has(entry.sessionId)) {
        sessionGroups.set(entry.sessionId, []);
      }
      sessionGroups.get(entry.sessionId)!.push(entry);
    });

    // DOPE Table with session headers
    const tableColumns = [
      { header: 'Date/Time', dataKey: 'datetime' },
      { header: 'Range(m)', dataKey: 'range' },
      { header: 'Model', dataKey: 'model' },
      { header: 'BC', dataKey: 'bc' },
      { header: 'Bullet(gr)', dataKey: 'bulletWeight' },
      { header: 'Temp(°C)', dataKey: 'temp' },
      { header: 'Humid(%)', dataKey: 'humidity' },
      { header: 'Wind(m/s)', dataKey: 'windSpeed' },
      { header: 'WDir(°)', dataKey: 'windDir' },
      { header: 'Vert(cm)', dataKey: 'vertical' },
      { header: 'Horz(cm)', dataKey: 'horizontal' },
      { header: 'Group(cm)', dataKey: 'group' },
      { header: 'Shots', dataKey: 'shots' },
      { header: `${scopeUnits} Adj`, dataKey: 'adjustments' },
      { header: 'Notes', dataKey: 'notes' }
    ];
    
    const tableData: any[] = [];
    
    // Add session headers and entries
    Array.from(sessionGroups.entries()).forEach(([sessionId, sessionEntries]) => {
      if (sessionEntries.length === 0) return;
      
      const isCurrentSession = sessionId === session.id;
      const sessionInfo = isCurrentSession ? session : {
        title: `Session ${sessionId.slice(0, 8)}`,
        place: "",
        startedAt: sessionEntries[0].createdAt
      };
      
      const firstEntry = sessionEntries[0];
      const bulletInfo = firstEntry.bulletWeightGr ? 
        `${firstEntry.ammoName || 'Unknown'} ${firstEntry.bulletWeightGr}gr` : 
        firstEntry.ammoName || 'Unknown';
      
      // Add session header row with more detailed information
      tableData.push({
        datetime: `📋 ${sessionInfo.title}${sessionInfo.place ? ` @ ${sessionInfo.place}` : ''}`,
        range: `Started: ${new Date(sessionInfo.startedAt).toLocaleDateString()}`,
        model: `Rifle: ${firstEntry.firearmName || 'N/A'}`,
        bc: `Ammo: ${bulletInfo}`,
        bulletWeight: `${firstEntry.bulletWeightGr}gr`,
        temp: `${firstEntry.temperature}°C`,
        humidity: `${firstEntry.humidity}%`,
        windSpeed: `${firstEntry.windSpeed}m/s`,
        windDir: `${firstEntry.windDirection}°`,
        vertical: `Zero: ${firstEntry.zeroDistanceM}m`,
        horizontal: `HOB: ${firstEntry.y0Cm}cm`,
        group: `${scopeUnits}`,
        shots: `V₀: ${firstEntry.V0}m/s`,
        adjustments: `BC: ${firstEntry.bcUsed?.toFixed(3)}`,
        notes: `Model: ${firstEntry.model}`
      });
      
      // Add entries for this session
      sessionEntries.forEach(entry => {
        // Get actual scope adjustments used instead of suggested
        const actualElevMil = entry.actualAdjMil?.up || 0;
        const actualElevMoa = entry.actualAdjMoa?.up || 0;
        const actualWindMil = entry.actualAdjMil?.right || 0;
        const actualWindMoa = entry.actualAdjMoa?.right || 0;
        
        const elevAdj = scopeUnits === 'MIL' 
          ? (actualElevMil === 0 ? '0.0' : `${actualElevMil > 0 ? 'U' : 'D'}${Math.abs(actualElevMil).toFixed(1)}`)
          : (actualElevMoa === 0 ? '0.0' : `${actualElevMoa > 0 ? 'U' : 'D'}${Math.abs(actualElevMoa).toFixed(1)}`);
        
        const windAdj = scopeUnits === 'MIL'
          ? (actualWindMil === 0 ? '0.0' : `${actualWindMil > 0 ? 'R' : 'L'}${Math.abs(actualWindMil).toFixed(1)}`)
          : (actualWindMoa === 0 ? '0.0' : `${actualWindMoa > 0 ? 'R' : 'L'}${Math.abs(actualWindMoa).toFixed(1)}`);
        
        tableData.push({
          datetime: `${new Date(entry.createdAt).toLocaleDateString()}\n${new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          range: entry.rangeM.toString(),
          model: entry.model,
          bc: entry.bcUsed?.toFixed(3) || 'N/A',
          bulletWeight: entry.bulletWeightGr?.toString() || 'N/A',
          temp: `${entry.temperature}°`,
          humidity: `${entry.humidity}%`,
          windSpeed: entry.windSpeed.toString(),
          windDir: `${entry.windDirection}°`,
          vertical: entry.offsetUpCm.toFixed(1),
          horizontal: entry.offsetRightCm.toFixed(1),
          group: entry.groupSizeCm?.toFixed(1) || '—',
          shots: entry.shots?.toString() || '—',
          adjustments: `${elevAdj}\n${windAdj}`,
          notes: entry.notes.length > 25 ? entry.notes.substring(0, 25) + '...' : entry.notes
        });
      });
    });
    
      // Verify autoTable is available before using it
      if (typeof doc.autoTable !== 'function') {
        throw new Error('autoTable function not available on jsPDF instance');
      }
      
      doc.autoTable({
      columns: tableColumns,
      body: tableData,
      startY: yPosition,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        overflow: 'linebreak',
        halign: 'center'
      },
      headStyles: {
        fillColor: [148, 0, 0], // #940000
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        datetime: { cellWidth: 18 },
        range: { cellWidth: 12 },
        model: { cellWidth: 10 },
        bc: { cellWidth: 12 },
        bulletWeight: { cellWidth: 12 },
        temp: { cellWidth: 12 },
        humidity: { cellWidth: 12 },
        windSpeed: { cellWidth: 12 },
        windDir: { cellWidth: 10 },
        vertical: { cellWidth: 12 },
        horizontal: { cellWidth: 12 },
        group: { cellWidth: 12 },
        shots: { cellWidth: 10 },
        adjustments: { cellWidth: 14 },
        notes: { cellWidth: 30 }
      },
      margin: { top: 10, right: 15, bottom: 20, left: 15 },
      didDrawCell: (data) => {
        // Style session header rows
        if (data.row.raw.datetime && data.row.raw.datetime.includes('📋')) {
          data.cell.styles.fillColor = [148, 0, 0]; // #940000
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: (data) => {
        // Footer
        const footerY = pageHeight - 10;
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Page ${data.pageNumber}`, pageWidth / 2, footerY, { align: 'center' });
        doc.text('Generated by Long Range DOPE Calculator', pageWidth - 15, footerY, { align: 'right' });
      }
    });
    
    // Generate filename
    const sessionName = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `dope-${sessionName}-${dateStr}.pdf`;
    
      // Save the PDF
      doc.save(filename);
    } catch (error) {
      console.error('Error exporting PDF with jsPDF:', error);
      
      // Try a simplified jsPDF approach without autoTable
      try {
        await generateSimplePDF(entries, session, getScopeUnits(entries));
      } catch (simpleError) {
        console.error('Error with simple PDF generation:', simpleError);
        // Final fallback to print method
        printToPDF();
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Simple PDF generation without autoTable
  const generateSimplePDF = async (entries: Entry[], session: Session, scopeUnits: string) => {
    if (!jsPDF) {
      const jsPDFModule = await import('jspdf');
      jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;
    
    const equipment = getEquipmentSummary(entries);
    const weather = getAverageWeather(entries);

    // Header
    doc.setFillColor(148, 0, 0);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('LONG RANGE DOPE CALCULATOR', 15, 16);

    // Session info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const sessionText = session.place ? `${session.title} @ ${session.place}` : session.title;
    doc.text(sessionText, pageWidth - 15, 12, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 20, { align: 'right' });

    // Reset text color
    doc.setTextColor(0, 0, 0);
    yPosition = 35;

    // Summary with equipment and weather
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Session Summary', 15, yPosition);
    yPosition += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const validGroups = entries.filter(e => e.groupSizeCm);
    const avgGroup = validGroups.length > 0 
      ? (validGroups.reduce((sum, e) => sum + e.groupSizeCm!, 0) / validGroups.length).toFixed(1)
      : 'N/A';
    
    doc.text(`Entries: ${entries.length} | Range: ${Math.min(...entries.map(e => e.rangeM))}-${Math.max(...entries.map(e => e.rangeM))}m | Avg Group: ${avgGroup}cm | Units: ${scopeUnits}`, 15, yPosition);
    yPosition += 8;

    // Equipment summary
    if (equipment) {
      doc.text(`Equipment: ${equipment.firearmName} | ${equipment.ammoName} | ${equipment.bulletWeightGr}gr | ${equipment.avgV0}m/s`, 15, yPosition);
      yPosition += 6;
    }

    // Weather summary
    if (weather) {
      doc.text(`Weather: ${weather.avgTemp}°C | ${weather.avgHumidity}% RH | Wind: ${weather.avgWindSpeed}m/s @ ${weather.avgWindDirection}°`, 15, yPosition);
      yPosition += 10;
    }

    // Simple table headers
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const headers = ['Date/Time', 'Range', 'Model', 'BC', 'Bullet', 'Temp', 'Humid', 'Wind', 'WDir', 'Vert', 'Horz', 'Group', 'Shots', 'Adj', 'Notes'];
    const colWidths = [20, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 16, 30];
    let xPos = 15;
    
    headers.forEach((header, i) => {
      doc.text(header, xPos, yPosition);
      xPos += colWidths[i];
    });
    
    yPosition += 8;

    // Entry rows
    doc.setFont('helvetica', 'normal');
    entries.forEach((entry, index) => {
      if (yPosition > 180) { // New page if needed
        doc.addPage();
        yPosition = 20;
      }

      xPos = 15;
      
      // Get actual scope adjustments
      const actualElevMil = entry.actualAdjMil?.up || 0;
      const actualElevMoa = entry.actualAdjMoa?.up || 0;
      
      const elevAdj = scopeUnits === 'MIL' 
        ? (actualElevMil === 0 ? '0.0' : `${actualElevMil > 0 ? 'U' : 'D'}${Math.abs(actualElevMil).toFixed(1)}`)
        : (actualElevMoa === 0 ? '0.0' : `${actualElevMoa > 0 ? 'U' : 'D'}${Math.abs(actualElevMoa).toFixed(1)}`);
      
      const rowData = [
        new Date(entry.createdAt).toLocaleDateString(),
        entry.rangeM.toString(),
        entry.model,
        entry.bcUsed?.toFixed(3) || 'N/A',
        entry.bulletWeightGr?.toString() || 'N/A',
        `${entry.temperature}°`,
        `${entry.humidity}%`,
        entry.windSpeed.toString(),
        `${entry.windDirection}°`,
        entry.offsetUpCm.toFixed(1),
        entry.offsetRightCm.toFixed(1),
        entry.groupSizeCm?.toFixed(1) || '—',
        entry.shots?.toString() || '—',
        elevAdj,
        entry.notes.length > 20 ? entry.notes.substring(0, 20) + '...' : entry.notes
      ];

      rowData.forEach((data, i) => {
        doc.text(data, xPos, yPosition);
        xPos += colWidths[i];
      });
      
      yPosition += 6;
    });

    // Generate filename
    const sessionName = session.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `dope-simple-${sessionName}-${dateStr}.pdf`;
    
    doc.save(filename);
  };

  // Generate HTML content for printing
  const generatePrintableHTML = (entries: Entry[], session: Session, scopeUnits: string): string => {
    const sessionGroups = new Map<string, Entry[]>();
    entries.forEach(entry => {
      if (!sessionGroups.has(entry.sessionId)) {
        sessionGroups.set(entry.sessionId, []);
      }
      sessionGroups.get(entry.sessionId)!.push(entry);
    });

    const sessionName = session.place ? `${session.title} @ ${session.place}` : session.title;
    const validGroups = entries.filter(e => e.groupSizeCm);
    const avgGroup = validGroups.length > 0 
      ? (validGroups.reduce((sum, e) => sum + e.groupSizeCm!, 0) / validGroups.length).toFixed(1)
      : 'N/A';
    const totalShots = entries.filter(e => e.shots).reduce((sum, e) => sum + e.shots!, 0);
    
    const equipment = getEquipmentSummary(entries);
    const weather = getAverageWeather(entries);

    let tableRows = '';
    Array.from(sessionGroups.entries()).forEach(([sessionId, sessionEntries]) => {
      if (sessionEntries.length === 0) return;
      
      const isCurrentSession = sessionId === session.id;
      const sessionInfo = isCurrentSession ? session : {
        title: `Session ${sessionId.slice(0, 8)}`,
        place: "",
        startedAt: sessionEntries[0].createdAt
      };
      
      const firstEntry = sessionEntries[0];
      const bulletInfo = firstEntry.bulletWeightGr ? 
        `${firstEntry.ammoName || 'Unknown'} ${firstEntry.bulletWeightGr}gr` : 
        firstEntry.ammoName || 'Unknown';
      
      // Session header row with comprehensive information
      tableRows += `
        <tr class="dope-session-header">
          <td colspan="15" style="background-color: #940000; color: white; padding: 8px; font-weight: bold;">
            📋 ${sessionInfo.title}${sessionInfo.place ? ` @ ${sessionInfo.place}` : ''} • 
            Started: ${new Date(sessionInfo.startedAt).toLocaleDateString()} • 
            Rifle: ${firstEntry.firearmName || 'N/A'} • 
            Ammo: ${bulletInfo} • 
            Avg Weather: ${firstEntry.temperature}°C, ${firstEntry.humidity}%RH, Wind ${firstEntry.windSpeed}m/s@${firstEntry.windDirection}° •
            Zero: ${firstEntry.zeroDistanceM}m • 
            HOB: ${firstEntry.y0Cm}cm
          </td>
        </tr>
      `;
      
      // Entry rows
      sessionEntries.forEach(entry => {
        // Get actual scope adjustments
        const actualElevMil = entry.actualAdjMil?.up || 0;
        const actualElevMoa = entry.actualAdjMoa?.up || 0;
        const actualWindMil = entry.actualAdjMil?.right || 0;
        const actualWindMoa = entry.actualAdjMoa?.right || 0;
        
        const elevAdj = scopeUnits === 'MIL' 
          ? (actualElevMil === 0 ? '0.0' : `${actualElevMil > 0 ? 'U' : 'D'}${Math.abs(actualElevMil).toFixed(1)}`)
          : (actualElevMoa === 0 ? '0.0' : `${actualElevMoa > 0 ? 'U' : 'D'}${Math.abs(actualElevMoa).toFixed(1)}`);
        
        const windAdj = scopeUnits === 'MIL'
          ? (actualWindMil === 0 ? '0.0' : `${actualWindMil > 0 ? 'R' : 'L'}${Math.abs(actualWindMil).toFixed(1)}`)
          : (actualWindMoa === 0 ? '0.0' : `${actualWindMoa > 0 ? 'R' : 'L'}${Math.abs(actualWindMoa).toFixed(1)}`);

        tableRows += `
          <tr>
            <td>${new Date(entry.createdAt).toLocaleDateString()}<br/>${new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${entry.rangeM}</td>
            <td>${entry.model}</td>
            <td>${entry.bcUsed?.toFixed(3) || 'N/A'}</td>
            <td>${entry.bulletWeightGr || 'N/A'}</td>
            <td>${entry.temperature}°</td>
            <td>${entry.humidity}%</td>
            <td>${entry.windSpeed}</td>
            <td>${entry.windDirection}°</td>
            <td>${entry.offsetUpCm.toFixed(1)}</td>
            <td>${entry.offsetRightCm.toFixed(1)}</td>
            <td>${entry.groupSizeCm?.toFixed(1) || '—'}</td>
            <td>${entry.shots || '—'}</td>
            <td>${elevAdj}<br/>${windAdj}</td>
            <td>${entry.notes.length > 30 ? entry.notes.substring(0, 30) + '...' : entry.notes}</td>
          </tr>
        `;
      });
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Long Range DOPE Data - ${sessionName}</title>
          <style>
            @page { 
              size: landscape; 
              margin: 0.5in; 
            }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 12px; 
              margin: 0; 
              padding: 0; 
            }
            .header {
              background-color: #940000;
              color: white;
              padding: 15px;
              text-align: center;
              margin-bottom: 20px;
            }
            .header h1 { 
              margin: 0; 
              font-size: 20px; 
            }
            .session-info { 
              margin: 5px 0; 
              font-size: 14px; 
            }
            .summary {
              margin-bottom: 20px;
              padding: 10px;
              background-color: #f5f5f5;
              border: 1px solid #ddd;
            }
            .summary h2 {
              margin: 0 0 10px 0;
              font-size: 16px;
            }
            .summary-stats {
              display: flex;
              flex-wrap: wrap;
              gap: 20px;
              margin-bottom: 10px;
            }
            .summary-stats span {
              font-size: 12px;
            }
            .equipment-weather {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-top: 10px;
              font-size: 11px;
            }
            .equipment-weather h3 {
              margin: 0 0 5px 0;
              font-size: 13px;
            }
            .equipment-weather div {
              margin-bottom: 3px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 10px; 
            }
            th, td { 
              border: 1px solid #ccc; 
              padding: 3px; 
              text-align: center; 
            }
            th { 
              background-color: #940000; 
              color: white; 
              font-weight: bold; 
              font-size: 9px;
            }
            tr:nth-child(even) { 
              background-color: #f9f9f9; 
            }
            .dope-session-header td {
              background-color: #940000 !important;
              color: white !important;
              font-weight: bold !important;
              text-align: left !important;
            }
            .footer {
              position: fixed;
              bottom: 10px;
              right: 10px;
              font-size: 10px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>LONG RANGE DOPE CALCULATOR</h1>
            <div class="session-info">${sessionName}</div>
            <div class="session-info">Generated: ${new Date().toLocaleString()}</div>
          </div>
          
          <div class="summary">
            <h2>Session Summary</h2>
            <div class="summary-stats">
              <span><strong>Total Entries:</strong> ${entries.length}</span>
              <span><strong>Range:</strong> ${Math.min(...entries.map(e => e.rangeM))}-${Math.max(...entries.map(e => e.rangeM))}m</span>
              <span><strong>Average Group:</strong> ${avgGroup}cm</span>
              <span><strong>Total Shots:</strong> ${totalShots}</span>
              <span><strong>Scope Units:</strong> ${scopeUnits}</span>
              <span><strong>Session Started:</strong> ${new Date(session.startedAt).toLocaleString()}</span>
            </div>
            
            ${equipment && weather ? `
            <div class="equipment-weather">
              <div>
                <h3>Equipment Information</h3>
                <div><strong>Rifle:</strong> ${equipment.firearmName}</div>
                <div><strong>Ammunition:</strong> ${equipment.ammoName}</div>
                <div><strong>Bullet:</strong> ${equipment.bulletWeightGr}gr, ${equipment.model}</div>
                <div><strong>Average Velocity:</strong> ${equipment.avgV0}m/s</div>
                <div><strong>Average BC:</strong> ${equipment.avgBC}</div>
                <div><strong>Barrel:</strong> ${equipment.barrelLengthIn}" (1:${equipment.twistRateIn}")</div>
                <div><strong>Setup:</strong> ${equipment.y0Cm}cm HOB, ${equipment.zeroDistanceM}m zero</div>
              </div>
              <div>
                <h3>Average Weather Conditions</h3>
                <div><strong>Temperature:</strong> ${weather.avgTemp}°C</div>
                <div><strong>Humidity:</strong> ${weather.avgHumidity}%</div>
                <div><strong>Wind Speed:</strong> ${weather.avgWindSpeed}m/s</div>
                <div><strong>Wind Direction:</strong> ${weather.avgWindDirection}°</div>
              </div>
            </div>
            ` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Range(m)</th>
                <th>Model</th>
                <th>BC</th>
                <th>Bullet(gr)</th>
                <th>Temp(°C)</th>
                <th>Humid(%)</th>
                <th>Wind(m/s)</th>
                <th>WDir(°)</th>
                <th>Vert(cm)</th>
                <th>Horz(cm)</th>
                <th>Group(cm)</th>
                <th>Shots</th>
                <th>${scopeUnits} Adj</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <div class="footer">
            Generated by Long Range DOPE Calculator
          </div>
        </body>
      </html>
    `;
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={exportToPDF}
        variant="outline"
        disabled={entries.length === 0 || isExporting}
        className={className}
        title="Export PDF using jsPDF (recommended)"
      >
        <FileDown className="w-4 h-4 mr-2" />
        {isExporting ? 'Exporting...' : `Export PDF (${entries.length} entries)`}
      </Button>
      <Button
        onClick={printToPDF}
        variant="outline"
        size="sm"
        disabled={entries.length === 0}
        className="px-2"
        title="Print to PDF (fallback method)"
      >
        <Printer className="w-4 h-4" />
      </Button>
    </div>
  );
}