import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import '../models/ponto_models.dart';
import '../utils/ponto_utils.dart';

class PDFService {
  static Future<void> generateAndPrintMonthlyReport({
    required List<DayLog> logs,
    required DateTime month,
    required String userName,
  }) async {
    final pdf = pw.Document();
    
    // Sort logs by date ascending
    final sortedLogs = List<DayLog>.from(logs)..sort((a, b) => a.date.compareTo(b.date));

    // Calculate totals
    double totalMonthlyMins = 0;
    double totalExtraMins = 0;

    for (var log in sortedLogs) {
      if (!log.isDayOff) {
        final stats = PontoUtils.calculateWorkedHours(log);
        if (stats != null) {
          totalMonthlyMins += (stats['totalMinutes'] as num).toDouble();
          totalExtraMins += (stats['extraMinutes'] as num).toDouble();
        }
      }
    }

    final totalMonthlyHours = (totalMonthlyMins / 60).floor();
    final totalMonthlyMinsRem = (totalMonthlyMins % 60).floor();
    final totalExtraHours = (totalExtraMins / 60).floor();
    final totalExtraMinsRem = (totalExtraMins % 60).floor();

    final monthStr = DateFormat('MMMM yyyy', 'pt_BR').format(month).toUpperCase();

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        header: (context) => _buildHeader(userName, monthStr),
        footer: (context) => _buildFooter(context),
        build: (context) => [
          pw.SizedBox(height: 20),
          _buildSummaryTable(
            totalMonthlyHours, totalMonthlyMinsRem,
            totalExtraHours, totalExtraMinsRem,
          ),
          pw.SizedBox(height: 20),
          _buildLogsTable(sortedLogs),
        ],
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: 'Folha_Ponto_${month.month}_${month.year}.pdf',
    );
  }

  static pw.Widget _buildHeader(String userName, String monthStr) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text('RELATÓRIO DE PONTO', style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
            pw.Text(monthStr, style: pw.TextStyle(fontSize: 16, color: PdfColors.grey700)),
          ],
        ),
        pw.SizedBox(height: 8),
        pw.Text('Motorista/Colaborador: $userName', style: const pw.TextStyle(fontSize: 14)),
        pw.Divider(),
      ],
    );
  }

  static pw.Widget _buildFooter(pw.Context context) {
    return pw.Container(
      alignment: pw.Alignment.centerRight,
      margin: const pw.EdgeInsets.only(top: 10),
      child: pw.Text(
        'Página ${context.pageNumber} de ${context.pagesCount}',
        style: const pw.TextStyle(fontSize: 12, color: PdfColors.grey),
      ),
    );
  }

  static pw.Widget _buildSummaryTable(int th, int tm, int eh, int em) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(12),
      decoration: const pw.BoxDecoration(
        color: PdfColors.grey200,
        borderRadius: pw.BorderRadius.all(pw.Radius.circular(8)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceAround,
        children: [
          pw.Column(
            children: [
              pw.Text('Total Trabalhado', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text('${th.toString().padLeft(2, '0')}:${tm.toString().padLeft(2, '0')}', style: const pw.TextStyle(fontSize: 18)),
            ],
          ),
          pw.Column(
            children: [
              pw.Text('Horas Extras', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.Text('${eh.toString().padLeft(2, '0')}:${em.toString().padLeft(2, '0')}', style: const pw.TextStyle(fontSize: 18)),
            ],
          ),
        ],
      ),
    );
  }

  static pw.Widget _buildLogsTable(List<DayLog> logs) {
    final headers = ['Data', 'Veículo', 'Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra', 'Avarias'];

    final data = logs.map((log) {
      final dateStr = DateFormat('dd/MM/yyyy').format(DateTime.parse(log.date));
      
      if (log.isDayOff) {
        return [dateStr, log.carPrefix, '-', '-', '-', '-', 'FOLGA', '-', '-'];
      }

      String entrada = '-';
      String pausa = '-';
      String retorno = '-';
      String fim = '-';

      for (var p in log.punches) {
        final timeStr = DateFormat('HH:mm').format(p.timestamp);
        if (p.type == PunchType.entrada) entrada = timeStr;
        if (p.type == PunchType.pausa) pausa = timeStr;
        if (p.type == PunchType.retorno) retorno = timeStr;
        if (p.type == PunchType.fim) fim = timeStr;
      }

      final stats = PontoUtils.calculateWorkedHours(log);
      final total = stats?['total'] ?? '-';
      final extra = stats?['extra'] ?? '-';
      
      String avarias = log.damagePhotos.isNotEmpty ? '${log.damagePhotos.length} fotos' : 'Nenhuma';

      return [dateStr, log.carPrefix, entrada, pausa, retorno, fim, total, extra, avarias];
    }).toList();

    return pw.TableHelper.fromTextArray(
      headers: headers,
      data: data,
      headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white),
      headerDecoration: const pw.BoxDecoration(color: PdfColors.blueGrey800),
      rowDecoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: 0.5))),
      cellAlignment: pw.Alignment.center,
      cellStyle: const pw.TextStyle(fontSize: 10),
      oddRowDecoration: const pw.BoxDecoration(color: PdfColors.grey100),
    );
  }
}
