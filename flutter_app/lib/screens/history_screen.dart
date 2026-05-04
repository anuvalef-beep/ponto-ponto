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

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Histórico de Pontos', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.calendar),
            onPressed: () {
              // TODO: Select Month
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

            return ListView.builder(
              padding: const EdgeInsets.all(16),
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
                        DateFormat('dd/MM/yyyy').format(DateTime.parse(log.date)),
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      subtitle: stats != null 
                        ? Text('Total: ${stats['total']} | Extra: ${stats['extra'] ?? '00:00'}')
                        : const Text('Incompleto'),
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            children: log.punches.map((p) => Padding(
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
                          ),
                        )
                      ],
                    ),
                  ),
                );
              },
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
