import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:signals_flutter/signals_flutter.dart';
import '../models/ponto_models.dart';
import '../signals/app_signals.dart';
import '../services/database_service.dart';
import '../utils/ponto_utils.dart';
import '../widgets/glass_container.dart';
import '../theme/app_theme.dart';
import 'package:url_launcher/url_launcher.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  Future<void> _shareToWhatsApp(BuildContext context, DayLog log) async {
    try {
      final date = DateFormat('dd/MM/yyyy').format(DateTime.parse(log.date));
      final stats = PontoUtils.calculateWorkedHours(log);
      
      String message = "*Relatório de Ponto - $date*\n";
      message += "🚗 Veículo: ${log.carPrefix}\n\n";
      
      for (var p in log.punches) {
        final time = DateFormat('HH:mm').format(p.timestamp);
        message += "📍 ${p.type.name.toUpperCase()}: $time\n";
      }
      
      if (stats != null) {
        message += "\n⏱️ Total Trabalhado: ${stats['total']}";
        if (stats['extra'] != null) {
          message += "\n⭐ Horas Extra: ${stats['extra']}";
        }
      }
      
      if (log.damagePhotos.isNotEmpty) {
        message += "\n\n📸 Fotos de Avarias:\n";
        for (var i = 0; i < log.damagePhotos.length; i++) {
          message += "${i + 1}. ${log.damagePhotos[i]}\n";
        }
      }
      
      final encodedMessage = Uri.encodeComponent(message);
      // Try WhatsApp direct first, then wa.me
      final whatsappUrl = Uri.parse("whatsapp://send?text=$encodedMessage");
      final webUrl = Uri.parse("https://wa.me/?text=$encodedMessage");
      
      if (await canLaunchUrl(whatsappUrl)) {
        await launchUrl(whatsappUrl);
      } else if (await canLaunchUrl(webUrl)) {
        await launchUrl(webUrl, mode: LaunchMode.externalApplication);
      } else {
        throw 'Não foi possível abrir o WhatsApp';
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao compartilhar: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _confirmDelete(BuildContext context, DayLog log) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Colors.grey.shade900,
        title: const Text('Excluir Registro?', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Text(
          'Deseja realmente excluir o registro do dia ${DateFormat('dd/MM/yyyy').format(DateTime.parse(log.date))}?\n\nEssa ação não pode ser desfeita.',
          style: const TextStyle(color: Colors.grey),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('CANCELAR', style: TextStyle(color: Colors.grey)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('EXCLUIR', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirmed == true && AppSignals.user.value != null) {
      final db = DatabaseService(uid: AppSignals.user.value!.uid);
      await db.deleteDayLog(log.date);

      if (AppSignals.currentDayLog.value?.date == log.date) {
        AppSignals.currentDayLog.value = null;
      }

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Registro excluído com sucesso!')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Histórico de Pontos', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.calendar),
            onPressed: () async {
              final DateTime? picked = await showDatePicker(
                context: context,
                initialDate: AppSignals.selectedMonth.value,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
                helpText: 'Selecione o mês do histórico',
              );
              if (picked != null) {
                AppSignals.selectedMonth.value = picked;
              }
            },
          ),
        ],
      ),
      body: Watch((context) {
        if (AppSignals.user.value == null) return const SizedBox();
        
        final db = DatabaseService(uid: AppSignals.user.value!.uid);
        
        return StreamBuilder<List<DayLog>>(
          stream: db.getLogs(AppSignals.selectedMonth.value),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            
            final logs = snapshot.data ?? [];
            if (logs.isEmpty) {
              return const Center(child: Text('Nenhum registro encontrado.'));
            }

            // Sort logs by date descending
            logs.sort((a, b) => b.date.compareTo(a.date));

            double totalMonthlyMins = 0;
            double totalExtraMins = 0;

            for (var log in logs) {
              final stats = PontoUtils.calculateWorkedHours(log);
              if (stats != null && !log.isDayOff) {
                totalMonthlyMins += (stats['totalMinutes'] as num).toDouble();
                totalExtraMins += (stats['extraMinutes'] as num).toDouble();
              }
            }

            final monthlyHours = (totalMonthlyMins / 60).floor();
            final monthlyMins = (totalMonthlyMins % 60).floor();
            final monthlyExtraHours = (totalExtraMins / 60).floor();
            final monthlyExtraMins = (totalExtraMins % 60).floor();

            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: GlassContainer(
                    color: AppTheme.primaryColor.withOpacity(0.1),
                    border: Border.all(color: AppTheme.primaryColor.withOpacity(0.5)),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          Column(
                            children: [
                              const Text('Total do Mês', style: TextStyle(color: Colors.grey, fontSize: 12)),
                              const SizedBox(height: 4),
                              Text(
                                '${monthlyHours.toString().padLeft(2, '0')}:${monthlyMins.toString().padLeft(2, '0')}',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Colors.white),
                              ),
                            ],
                          ),
                          Container(width: 1, height: 40, color: Colors.grey.shade800),
                          Column(
                            children: [
                              const Text('Horas Extras', style: TextStyle(color: Colors.grey, fontSize: 12)),
                              const SizedBox(height: 4),
                              Text(
                                '${monthlyExtraHours.toString().padLeft(2, '0')}:${monthlyExtraMins.toString().padLeft(2, '0')}',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Colors.amber),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: logs.length,
                    itemBuilder: (context, index) {
                final log = logs[index];
                final stats = PontoUtils.calculateWorkedHours(log);
                
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: GlassContainer(
                    child: ExpansionTile(
                      shape: const Border(),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(LucideIcons.calendarDays, color: AppTheme.primaryColor),
                      ),
                      title: Text(
                        '${DateFormat('dd/MM/yyyy').format(DateTime.parse(log.date))} - ${log.carPrefix}',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: stats != null 
                        ? Text('Total: ${stats['total']} | Extra: ${stats['extra'] ?? '00:00'}')
                        : const Text('Incompleto'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(LucideIcons.share2, color: Colors.green),
                            onPressed: () => _shareToWhatsApp(context, log),
                          ),
                          IconButton(
                            icon: const Icon(LucideIcons.trash2, color: Colors.redAccent),
                            onPressed: () => _confirmDelete(context, log),
                          ),
                        ],
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            children: [
                              ...log.punches.map((p) => Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4.0),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(_getIconForType(p.type), size: 16, color: Colors.grey),
                                        const SizedBox(width: 8),
                                        Text(p.type.name.toUpperCase(), style: const TextStyle(fontSize: 12)),
                                      ],
                                    ),
                                    Text(
                                      DateFormat('HH:mm:ss').format(p.timestamp),
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    ),
                                  ],
                                ),
                              )).toList(),
                              
                              if (log.damagePhotos.isNotEmpty) ...[
                                const Divider(height: 32),
                                const Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text('FOTOS DE AVARIAS:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.grey)),
                                ),
                                const SizedBox(height: 12),
                                SizedBox(
                                  height: 100,
                                  child: ListView.builder(
                                    scrollDirection: Axis.horizontal,
                                    itemCount: log.damagePhotos.length,
                                    itemBuilder: (context, i) {
                                      return Padding(
                                        padding: const EdgeInsets.only(right: 8.0),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(8),
                                          child: Image.network(
                                            log.damagePhotos[i],
                                            width: 100,
                                            height: 100,
                                            fit: BoxFit.cover,
                                            loadingBuilder: (context, child, progress) {
                                              if (progress == null) return child;
                                              return Container(
                                                width: 100,
                                                height: 100,
                                                color: Colors.grey.shade800,
                                                child: const Center(child: CircularProgressIndicator()),
                                              );
                                            },
                                            errorBuilder: (context, error, stackTrace) => Container(
                                              width: 100,
                                              height: 100,
                                              color: Colors.red.withOpacity(0.1),
                                              child: const Center(child: Icon(LucideIcons.imageOff, color: Colors.red)),
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ],
                          ),
                        )
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
        );
      }),
    );
  }

  IconData _getIconForType(PunchType type) {
    switch (type) {
      case PunchType.entrada: return LucideIcons.play;
      case PunchType.pausa: return LucideIcons.pause;
      case PunchType.retorno: return LucideIcons.rotateCcw;
      case PunchType.fim: return LucideIcons.square;
    }
  }
}
