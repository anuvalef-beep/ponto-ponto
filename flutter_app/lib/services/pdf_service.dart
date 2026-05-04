import 'dart:io';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import '../models/ponto_models.dart';
import '../utils/ponto_utils.dart';

class PDFService {
  static Future<File> generateReport(List<DayLog> logs, String userName) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.MultiPage(
        build: (context) => [
          pw.Header(
            level: 0,
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text('Relatorio de Ponto - $userName', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                pw.Text(DateTime.now().toString().split('.')[0]),
              ],
            ),
          ),
          pw.SizedBox(height: 20),
          pw.TableHelper.fromTextArray(
            headers: ['Data', 'Entrada', 'Pausa', 'Retorno', 'Fim', 'Total', 'Extra'],
            data: logs.map((log) {
              final stats = PontoUtils.calculateWorkedHours(log);
              final punches = log.punches;
              return [
                log.date,
                _getPunchTime(punches, PunchType.entrada),
                _getPunchTime(punches, PunchType.pausa),
                _getPunchTime(punches, PunchType.retorno),
                _getPunchTime(punches, PunchType.fim),
                stats?['total'] ?? '-',
                stats?['extra'] ?? '-',
              ];
            }).toList(),
          ),
        ],
      ),
    );

    final output = await getTemporaryDirectory();
    final file = File("${output.path}/relatorio_ponto.pdf");
    await file.writeAsBytes(await pdf.save());
    return file;
  }

  static String _getPunchTime(List<Punch> punches, PunchType type) {
    final p = punches.where((p) => p.type == type).firstOrNull;
    if (p == null) return '-';
    return "${p.timestamp.hour.toString().padLeft(2, '0')}:${p.timestamp.minute.toString().padLeft(2, '0')}";
  }
}
