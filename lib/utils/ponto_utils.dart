import '../models/ponto_models.dart';

class PontoUtils {
  static Map<String, dynamic>? calculateWorkedHours(DayLog log) {
    if (log.isDayOff) return {'total': 'FOLGA', 'isDayOff': true};
    
    final punches = _normalizePunches(log.punches);
    
    final entrada = punches.where((p) => p.type == PunchType.entrada).firstOrNull;
    if (entrada == null) return null;

    final fim = punches.where((p) => p.type == PunchType.fim).firstOrNull;
    if (fim == null) return null;

    final pausa = punches.where((p) => p.type == PunchType.pausa).firstOrNull;
    final retorno = punches.where((p) => p.type == PunchType.retorno).firstOrNull;

    int workedMs = 0;
    
    if (pausa != null && retorno != null && 
        pausa.timestamp.isBefore(retorno.timestamp) && 
        entrada.timestamp.isBefore(pausa.timestamp) && 
        retorno.timestamp.isBefore(fim.timestamp)) {
      workedMs = (pausa.timestamp.difference(entrada.timestamp).inMilliseconds) + 
                 (fim.timestamp.difference(retorno.timestamp).inMilliseconds);
    } else {
      workedMs = fim.timestamp.difference(entrada.timestamp).inMilliseconds;
    }

    final totalMinutes = workedMs / (1000 * 60);
    final hours = (totalMinutes / 60).floor();
    final minutes = (totalMinutes % 60).floor();
    
    final limitMinutes = 7 * 60 + 20; // 7:20
    final extraMinutes = totalMinutes > limitMinutes ? totalMinutes - limitMinutes : 0.0;
    final extraHours = (extraMinutes / 60).floor();
    final extraMins = (extraMinutes % 60).floor();

    final totalStr = hours < 0 
        ? "-${hours.abs().toString().padLeft(2, '0')}:${minutes.abs().toString().padLeft(2, '0')}"
        : "${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}";

    return {
      'total': totalStr,
      'extra': extraMinutes > 0 
          ? "${extraHours.toString().padLeft(2, '0')}:${extraMins.toString().padLeft(2, '0')}" 
          : null,
      'totalMinutes': totalMinutes,
      'extraMinutes': extraMinutes,
    };
  }

  static int calculateWorkedMinutesSoFar(DayLog log, DateTime now) {
    final punches = _normalizePunches(log.punches);
    if (punches.isEmpty) return 0;

    final entrada = punches.where((p) => p.type == PunchType.entrada).firstOrNull;
    if (entrada == null) return 0;

    final pausa = punches.where((p) => p.type == PunchType.pausa).firstOrNull;
    final retorno = punches.where((p) => p.type == PunchType.retorno).firstOrNull;
    final fim = punches.where((p) => p.type == PunchType.fim).firstOrNull;

    int workedMs = 0;

    if (fim != null) {
      if (pausa != null && retorno != null) {
        workedMs = (pausa.timestamp.difference(entrada.timestamp).inMilliseconds) + 
                   (fim.timestamp.difference(retorno.timestamp).inMilliseconds);
      } else {
        workedMs = fim.timestamp.difference(entrada.timestamp).inMilliseconds;
      }
    } else {
      if (pausa != null && retorno != null) {
         workedMs = (pausa.timestamp.difference(entrada.timestamp).inMilliseconds) + 
                   (now.difference(retorno.timestamp).inMilliseconds);
      } else if (pausa != null && retorno == null) {
         workedMs = pausa.timestamp.difference(entrada.timestamp).inMilliseconds;
      } else {
         workedMs = now.difference(entrada.timestamp).inMilliseconds;
      }
    }

    if (workedMs < 0) workedMs = 0;
    return (workedMs / (1000 * 60)).floor();
  }

  static List<Punch> _normalizePunches(List<Punch> punches) {
    if (punches.isEmpty) return [];
    
    final order = {PunchType.entrada: 0, PunchType.pausa: 1, PunchType.retorno: 2, PunchType.fim: 3};
    final sortedPunches = List<Punch>.from(punches)..sort((a, b) => order[a.type]!.compareTo(order[b.type]!));

    List<Punch> normalized = [];
    DateTime? previousTime;

    for (var punch in sortedPunches) {
      DateTime time = punch.timestamp;
      
      if (previousTime != null) {
        final currMins = time.hour * 60 + time.minute;
        final prevMins = previousTime.hour * 60 + previousTime.minute;
        
        DateTime normalizedTime = DateTime(
          previousTime.year,
          previousTime.month,
          previousTime.day,
          time.hour,
          time.minute,
          time.second,
        );

        if (currMins < prevMins) {
          normalizedTime = normalizedTime.add(const Duration(days: 1));
        }
        
        time = normalizedTime;
        normalized.add(Punch(id: punch.id, type: punch.type, timestamp: normalizedTime, carPrefix: punch.carPrefix));
      } else {
        normalized.add(punch);
      }
      previousTime = time;
    }
    return normalized;
  }
}
